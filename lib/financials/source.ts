import fs from "node:fs/promises";
import path from "node:path";
import { inflateRawSync, crc32 } from "node:zlib";
import { fetchIndexMembers } from "@/lib/sources/minervini";
import { readMarketCaps, type ValuationMarketCaps } from "@/lib/valuation/market-caps";
import { classifyFinancial, parseFinancialReport, type DartAccount } from "./parse";
import { metricLabels, type FinancialCompany, type FinancialPublication } from "./types";

const root = path.join(process.cwd(), "data", "financials");
const cacheRoot = path.join(process.cwd(), "tmp", "financial-cache-v1");
export const financialPublicationPath = path.join(root, "board.json");
export async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(value) + "\n", { flag: "wx" });
    // Windows scanners/readers can briefly hold the destination open. Never delete the last good file.
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(tmp, file); break; }
      catch (e) {
        if (attempt >= 6 || !["EPERM", "EBUSY", "EACCES"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }
  finally { await fs.unlink(tmp).catch(() => undefined); }
}
export async function readFinancialPublication(file = financialPublicationPath): Promise<FinancialPublication | null> {
  let parsed: FinancialPublication;
  try { parsed = JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("재무 저장 파일을 읽을 수 없습니다."); }
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.companies) || !Number.isFinite(Date.parse(parsed.membershipAt)) || !Number.isFinite(Date.parse(parsed.publishedAt)) || new Set(parsed.companies.map(c => c.code)).size !== parsed.companies.length) throw new Error("재무 저장 파일 형식 오류");
  for (const c of parsed.companies) {
    if (!/^[0-9A-Z]{6}$/.test(c.code) || typeof c.name !== "string" || !Array.isArray(c.reports) || !Array.isArray(c.errors) || ![true, false, null].includes(c.financial)) throw new Error("재무 기업 자료 형식 오류");
    if (new Set(c.reports.map(r => r.periodEnd)).size !== c.reports.length) throw new Error("중복 재무기간");
    for (const r of c.reports) {
      if (r.currency !== "KRW" || !["CFS", "OFS"].includes(r.scope) || !r.values || Object.keys(metricLabels).some(k => !(k in r.values)) || Object.values(r.values).some(n => n !== null && !Number.isFinite(n))) throw new Error("재무 수치 검증 오류");
      if (![1, 2, 3, 4].includes(r.quarter) || r.periodEnd !== `${r.year}-${["03-31", "06-30", "09-30", "12-31"][r.quarter - 1]}` || !/^\d{14}$/.test(r.receipt) || !Number.isFinite(Date.parse(r.fetchedAt))) throw new Error("재무기간·접수번호 검증 오류");
    }
    if (c.market && (c.market.exchange !== "KRX" || c.market.priceTime !== "15:30" || !/^\d{4}-\d{2}-\d{2}$/.test(c.market.date) || !Number.isFinite(c.market.close) || c.market.close <= 0 || !Number.isFinite(c.market.marketCap) || c.market.marketCap <= 0)) throw new Error("KRX 가격 기준 검증 오류");
  }
  return parsed;
}

/** Read only the expected XML member, in memory. Never extract arbitrary ZIP paths. */
export function extractCorpXml(zip: Buffer): string {
  if (zip.length > 20_000_000) throw new Error("DART 고유번호 ZIP 크기 초과");
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("DART 고유번호 ZIP 형식 오류");
  let offset = zip.readUInt32LE(end + 16);
  const count = zip.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP 디렉터리 오류");
    const nameLength = zip.readUInt16LE(offset + 28), extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.toUpperCase() === "CORPCODE.XML") {
      const method = zip.readUInt16LE(offset + 10), packed = zip.readUInt32LE(offset + 20), size = zip.readUInt32LE(offset + 24), local = zip.readUInt32LE(offset + 42), crc = zip.readUInt32LE(offset + 16);
      if (size > 80_000_000 || (zip.readUInt16LE(offset + 8) & 1) || local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) throw new Error("ZIP 멤버 검증 오류");
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      if (start + packed > zip.length) throw new Error("ZIP 멤버 범위 오류");
      const bytes = zip.subarray(start, start + packed);
      const output = method === 0 ? bytes : method === 8 ? inflateRawSync(bytes, { maxOutputLength: 80_000_000 }) : null;
      if (!output || output.length !== size || crc32(output) !== crc) throw new Error("ZIP 압축·무결성 검증 실패");
      return output.toString("utf8");
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error("DART 고유번호 XML 없음");
}
export function parseCorpCodes(xml: string) {
  const entries = new Map<string, string>();
  for (const match of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const code = match[1].match(/<stock_code>\s*([0-9A-Z]{6})\s*<\/stock_code>/)?.[1];
    const corp = match[1].match(/<corp_code>(\d{8})<\/corp_code>/)?.[1];
    if (code && corp) { if (entries.has(code)) throw new Error("DART 종목코드 중복"); entries.set(code, corp); }
  }
  if (entries.size < 1000) throw new Error("DART 상장회사 고유번호 목록 불완전");
  return Object.fromEntries(entries);
}
export class DartApiError extends Error { constructor(public status: string) { super(`DART API 상태 ${status}`); } }
let nextRequestAt = 0;
export async function dartRequest(endpoint: string, params: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const key = process.env.DART_API_KEY?.trim();
  if (!key) throw new Error("DART_API_KEY 설정이 필요합니다.");
  if (!["company.json", "fnlttSinglAcntAll.json"].includes(endpoint)) throw new Error("DART API 경로 오류");
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = Math.max(Date.now(), nextRequestAt); nextRequestAt = start + 400;
    if (start > Date.now()) await new Promise(resolve => setTimeout(resolve, start - Date.now()));
    try {
      response = await fetchImpl(`https://opendart.fss.or.kr/api/${endpoint}?${new URLSearchParams({ ...params, crtfc_key: key })}`, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (response.status !== 429 && response.status < 500) break;
    } catch { if (attempt === 2) throw new Error("DART API 네트워크 연결 실패 (3회 시도)"); }
    await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
  }
  if (!response) throw new Error("DART API 응답 없음");
  if (!response.ok) throw new Error(`DART API HTTP ${response.status}`);
  let data: Record<string, unknown>;
  try { data = await response.json(); } catch { throw new Error("DART API JSON 형식 오류"); }
  if (data.status !== "000") throw new DartApiError(String(data.status ?? "unknown"));
  return data;
}
async function cached<T>(name: string, days: number, refresh: boolean, work: () => Promise<T>): Promise<T> {
  const file = path.join(cacheRoot, `${name}.json`);
  if (!refresh) {
    try {
      const saved = JSON.parse(await fs.readFile(file, "utf8")) as { at: number; data: T };
      if (Date.now() - saved.at < days * 86400000) return saved.data;
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT" && !(e instanceof SyntaxError)) throw e; }
  }
  const data = await work(); await atomicJson(file, { at: Date.now(), data }); return data;
}
async function corpCodes(refresh: boolean): Promise<Record<string, string>> {
  return cached("corp-codes", 7, refresh, async () => {
    const key = process.env.DART_API_KEY?.trim(); if (!key) throw new Error("DART_API_KEY 설정이 필요합니다.");
    let response: Response;
    try { response = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?${new URLSearchParams({ crtfc_key: key })}`, { signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error("DART 고유번호 연결 실패"); }
    if (!response.ok) throw new Error(`DART 고유번호 HTTP ${response.status}`);
    return parseCorpCodes(extractCorpXml(Buffer.from(await response.arrayBuffer())));
  });
}
export function reportRequests(now: Date) {
  const kst = new Date(now.getTime() + 9 * 3600000), year = kst.getUTCFullYear();
  const list: { year: number; quarter: 1 | 2 | 3 | 4 }[] = [];
  for (let y = year - 5; y < year; y++) list.push({ year: y, quarter: 4 });
  for (const y of [year - 1, year]) for (const q of [1, 2, 3] as const) {
    if (`${y}-${["03-31", "06-30", "09-30"][q - 1]}` < kst.toISOString().slice(0, 10)) list.push({ year: y, quarter: q });
  }
  return list;
}
async function collectReport(corpCode: string, year: number, quarter: 1 | 2 | 3 | 4, now: Date, refresh: boolean) {
  const reportCode = { 1: "11013", 2: "11012", 3: "11014", 4: "11011" }[quarter];
  return cached(`report-${corpCode}-${year}-${reportCode}`, year < now.getUTCFullYear() - 1 ? 30 : 1, refresh, async () => {
    for (const scope of ["CFS", "OFS"] as const) {
      try {
        const data = await dartRequest("fnlttSinglAcntAll.json", { corp_code: corpCode, bsns_year: String(year), reprt_code: reportCode, fs_div: scope });
        if (!Array.isArray(data.list)) throw new Error("DART 계정 목록 형식 오류");
        return parseFinancialReport(data.list as DartAccount[], { corpCode, year, quarter, scope, now });
      } catch (e) { if (e instanceof DartApiError && e.status === "013") continue; throw e; }
    }
    return null;
  });
}
export function applyFinancialMarketCaps(publication: FinancialPublication, caps: ValuationMarketCaps | null): FinancialPublication {
  return { ...publication, companies: publication.companies.map(company => {
    const close = caps?.closes[company.code], marketCap = caps?.values[company.code];
    const market = caps && close != null && marketCap != null ? { date: caps.asOf, exchange: "KRX" as const, priceTime: "15:30" as const, close, marketCap, fetchedAt: caps.fetchedAt } : null;
    return { ...company, market };
  }) };
}
export async function collectFinancials(options: { refresh?: boolean; codes?: string[]; retryFailed?: boolean; limit?: number; onProgress?: (text: string) => void } = {}) {
  const now = new Date(), refresh = options.refresh ?? false;
  const previous = await readFinancialPublication();
  const [members, codes] = await Promise.all([fetchIndexMembers("kospi200"), corpCodes(refresh)]);
  if (options.codes?.some(code => !members.some(m => m.code === code))) throw new Error("선택 종목이 현재 코스피200 구성에 없습니다.");
  // Public, saved FCF is reusable only as a separately labelled vendor reference.
  let references: { data?: { compositionDate: string; sourceUpdatedAt: string | null; stocks: { code: string; values: { fcf?: number | null } }[] } } = {};
  try { references = JSON.parse(await fs.readFile(path.join(process.cwd(), "data/valuation/stocks.json"), "utf8")); } catch { /* optional */ }
  let sectors: Record<string, string> = {};
  try { const s = JSON.parse(await fs.readFile(path.join(process.cwd(), "data/sectors/board.json"), "utf8")); sectors = Object.fromEntries(s.snapshots.kospi200[s.latestDate].rows.map((r: { code: string; industry: string }) => [r.code, r.industry])); } catch { /* DART profile still classifies finance */ }
  let caps: ValuationMarketCaps | null = null;
  try { caps = await readMarketCaps(); } catch { /* failed market data remains missing */ }
  const companies: FinancialCompany[] = [];
  const oldByCode = new Map(previous?.companies.map(c => [c.code, c]) ?? []);
  const candidates = members.filter(m => (!options.codes || options.codes.includes(m.code)) && (!options.retryFailed || !oldByCode.get(m.code)?.reports.length || oldByCode.get(m.code)!.errors.length > 0));
  if (options.retryFailed) candidates.sort((a, b) => Number(!!oldByCode.get(a.code)?.reports.length) - Number(!!oldByCode.get(b.code)?.reports.length));
  const selected = candidates.slice(0, options.limit ?? members.length);
  if (!selected.length && previous) return previous;
  for (let i = 0; i < selected.length; i += 4) {
    const batch = await Promise.all(selected.slice(i, i + 4).map(async member => {
      const old = oldByCode.get(member.code);
      const sameCorp = old?.corpCode === codes[member.code];
      const company: FinancialCompany = { code: member.code, name: member.name, corpCode: codes[member.code] ?? null, industry: sectors[member.code] ?? old?.industry ?? "미확인", financial: sameCorp ? old?.financial ?? null : null, fiscalMonth: sameCorp ? old?.fiscalMonth ?? null : null, reports: sameCorp ? old?.reports ?? [] : [], errors: [], attemptedAt: now.toISOString(), referenceFcf: null, market: null };
      const ref = references.data?.stocks.find(s => s.code === member.code);
      if (ref && references.data) company.referenceFcf = { value: ref.values.fcf == null ? null : ref.values.fcf * 1e8, source: "QuantiWise E124260.M", compositionDate: references.data.compositionDate, sourceUpdatedAt: references.data.sourceUpdatedAt, definition: "기존 12개월 선행 조회표의 공급자 FCF. 상세 산식·예상기간 미검증. 공시 FCF와 혼합하지 않음" };
      const close = caps?.closes[member.code], marketCap = caps?.values[member.code];
      if (caps && close != null && marketCap != null) company.market = { date: caps.asOf, exchange: "KRX", priceTime: "15:30", close, marketCap, fetchedAt: caps.fetchedAt };
      else company.errors.push("KRX 종가·시가총액 저장 자료 없음");
      if (!company.corpCode) { company.errors.push("DART 고유번호 매핑 없음"); return company; }
      try {
        const profile = await cached(`profile-${company.corpCode}`, 7, refresh, () => dartRequest("company.json", { corp_code: company.corpCode! }));
        if (profile.stock_code !== member.code || profile.corp_code !== company.corpCode) throw new Error("DART 기업개황 코드 불일치");
        company.fiscalMonth = String(profile.acc_mt ?? "");
        const industry = String(profile.induty_code ?? "");
        company.industryCode = industry;
        company.financialBasis = "DART 업종코드 + NAVER 업종. 64992 지주회사는 업종을 함께 확인";
        company.financial = classifyFinancial(industry, company.industry);
        if (!company.fiscalMonth || Number(company.fiscalMonth) !== 12) { company.errors.push("12월 결산 외 기업: 기간 매핑 검증 전 수집 보류"); return company; }
        const reports = new Map(company.reports.map(r => [`${r.year}-${r.quarter}`, r]));
        for (const period of reportRequests(now)) {
          try {
            const report = await collectReport(company.corpCode, period.year, period.quarter, now, refresh);
            if (report) reports.set(`${report.year}-${report.quarter}`, report);
          } catch (e) {
            if (e instanceof DartApiError && ["010", "011", "012", "020", "800", "901"].includes(e.status)) throw e;
            company.errors.push(`${period.year} Q${period.quarter}: ${e instanceof Error ? e.message : "수집 실패"}`);
          }
        }
        company.reports = [...reports.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
        if (!company.reports.length) company.errors.push("공시 재무제표 확보 실패");
      } catch (e) { company.errors.push(e instanceof Error ? e.message : "DART 수집 실패"); }
      options.onProgress?.(`${member.code} ${member.name}: ${company.reports.length}개 보고서 / 오류 ${company.errors.length}건`);
      return company;
    }));
    companies.push(...batch);
    // Checkpoint full membership, retaining last successful company reports when interrupted.
    const collected = new Map(companies.map(c => [c.code, c]));
    const all = members.map(m => collected.get(m.code) ?? oldByCode.get(m.code) ?? ({ code: m.code, name: m.name, corpCode: codes[m.code] ?? null, industry: sectors[m.code] ?? "미확인", financial: null, fiscalMonth: null, reports: [], errors: ["수집 대기"], attemptedAt: null, referenceFcf: null, market: null } satisfies FinancialCompany));
    const publication: FinancialPublication = { schemaVersion: 1, publishedAt: new Date().toISOString(), membershipAt: now.toISOString(), membershipSource: "NAVER 코스피200 구성종목 API (현재 구성·과거 시점 구성 아님)", companies: all };
    await atomicJson(financialPublicationPath, publication);
  }
  return (await readFinancialPublication())!;
}

/** Re-evaluate sector rules using saved public company profiles without external requests. */
export async function reclassifySavedFinancials() {
  const publication = await readFinancialPublication(); if (!publication) throw new Error("저장된 재무 자료가 없습니다.");
  for (const c of publication.companies) {
    try {
      const cached = JSON.parse(await fs.readFile(path.join(cacheRoot, `profile-${c.corpCode}.json`), "utf8"));
      const profile = cached.data;
      if (profile.stock_code !== c.code || profile.corp_code !== c.corpCode) continue;
      c.industryCode = String(profile.induty_code ?? "");
      c.financialBasis = "DART 업종코드 + NAVER 업종. 64992 지주회사는 업종을 함께 확인";
      c.financial = classifyFinancial(c.industryCode, c.industry);
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  publication.publishedAt = new Date().toISOString();
  await atomicJson(financialPublicationPath, publication); return publication;
}
