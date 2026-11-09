import { minerviniSession } from "@/lib/market/minervini-session";
import { fetchKrxDailyCloses, type KrxDailyClose } from "@/lib/sources/krx-daily-prices";
import fs from "node:fs/promises";
import path from "node:path";

export type AdrDay = { date: string; advancers: number; decliners: number; unchanged: number; value: number | null };
export type AdrPublication = { version: 1; source: "NAVER_KRX_REGULAR"; asOf: string; fetchedAt: string; membershipAt: string; markets: Record<"KOSPI" | "KOSDAQ", { universeSize: number; days: AdrDay[] }> };
export const adrPath = path.join(process.cwd(), "data", "adr", "board.json");

/** Preserve older validated sessions only when the refreshed history overlaps them. */
export function mergeAdrHistory(previous: AdrDay[], fresh: AdrDay[], asOf: string): AdrDay[] {
  if (!fresh.length) throw new Error("ADR 이력 없음");
  const first = fresh[0].date;
  const overlaps = previous.some(day => day.date === first);
  const oldByDate = new Map(previous.map(day => [day.date, day]));
  const validated = overlaps ? fresh.map(day => day.value === null && oldByDate.get(day.date)?.value != null ? oldByDate.get(day.date)! : day) : fresh;
  const result = overlaps ? [...previous.filter(day => day.date < first), ...validated] : validated;
  const cutoff = new Date(`${asOf}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  return result.filter(day => day.date >= cutoff.toISOString().slice(0, 10));
}

export function calculateAdr(dates: string[], histories: KrxDailyClose[][]): AdrDay[] {
  const totals = dates.map(date => ({ date, advancers: 0, decliners: 0, unchanged: 0, value: null as number | null }));
  for (const history of histories) {
    const prices = new Map(history.map(p => [p.date, p.close]));
    for (let i = 1; i < dates.length; i++) {
      const current = prices.get(dates[i]), previous = prices.get(dates[i - 1]);
      if (current == null || previous == null) continue;
      if (current > previous) totals[i].advancers++;
      else if (current < previous) totals[i].decliners++;
      else totals[i].unchanged++;
    }
  }
  for (let i = 20; i < totals.length; i++) {
    const window = totals.slice(i - 19, i + 1);
    if (window.some(d => d.advancers + d.decliners + d.unchanged === 0)) continue;
    const up = window.reduce((n, d) => n + d.advancers, 0);
    const down = window.reduce((n, d) => n + d.decliners, 0);
    if (down > 0) totals[i].value = up / down * 100;
  }
  return totals.slice(1);
}

export async function listStocksOnce(market: "KOSPI" | "KOSDAQ", fetchImpl: typeof fetch): Promise<string[]> {
  const codes = new Set<string>();
  const seen = new Set<string>();
  async function pageAt(page: number) {
    const r = await fetchImpl(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!r.ok) throw new Error(`${market} 목록 HTTP ${r.status}`);
    const body = await r.json() as { stocks?: Record<string, unknown>[]; totalCount?: number };
    if (!Array.isArray(body.stocks) || !Number.isInteger(body.totalCount)) throw new Error(`${market} 목록 형식 오류`);
    return body as { stocks: Record<string, unknown>[]; totalCount: number };
  }
  const first = await pageAt(1);
  const total = first.totalCount;
  const pageCount = Math.ceil(total / 100);
  if (pageCount < 1 || pageCount > 50) throw new Error(`${market} 목록 페이지 초과`);
  const pages = [first];
  for (let start = 2; start <= pageCount; start += 8) {
    const numbers = Array.from({ length: Math.min(8, pageCount - start + 1) }, (_, i) => start + i);
    pages.push(...await Promise.all(numbers.map(pageAt)));
  }
  for (const [index, body] of pages.entries()) {
    const expected = Math.min(100, total - index * 100);
    if (body.totalCount !== total || body.stocks.length !== expected) throw new Error(`${market} 목록 누락`);
    for (const row of body.stocks) {
      if (row.stockEndType !== "stock") continue;
      const venue = row.stockExchangeType as { name?: string } | undefined;
      if (venue?.name !== market || !/^[0-9A-Z]{6}$/.test(String(row.itemCode))) throw new Error(`${market} 종목 정보 오류`);
      const code = String(row.itemCode);
      if (seen.has(code)) throw new Error(`${market} 종목 중복`);
      seen.add(code);
      // Trading suspensions are not active issues and must not enter breadth counts.
      if (row.tradableStatus === "tradable") codes.add(code);
    }
  }
  if (codes.size < (market === "KOSPI" ? 500 : 1000)) throw new Error(`${market} 종목 수 부족`);
  return [...codes].sort();
}

async function listStocks(market: "KOSPI" | "KOSDAQ", fetchImpl: typeof fetch): Promise<string[]> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const first = await listStocksOnce(market, fetchImpl);
      const second = await listStocksOnce(market, fetchImpl);
      if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error(`${market} 종목 목록 변경`);
      return first;
    }
    catch (error) { last = error; }
  }
  throw last;
}

async function loadHistory(code: string, asOf: string, count: number, fetchImpl: typeof fetch): Promise<KrxDailyClose[]> {
  const dir = path.join(process.cwd(), "tmp", "adr-naver", asOf, String(count));
  const file = path.join(dir, `${code}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(file, "utf8")) as KrxDailyClose[];
    if (Array.isArray(cached) && cached.at(-1)?.date === asOf && cached.at(-1)?.close != null) return cached;
  } catch { /* collect this stock */ }
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const history = await fetchKrxDailyCloses(code, asOf, fetchImpl, count);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(history));
      return history;
    } catch (error) { last = error; }
  }
  throw last;
}

export async function collectAdr(now = new Date(), fetchImpl: typeof fetch = fetch, options: { backfill5y?: boolean } = {}): Promise<AdrPublication> {
  const asOf = minerviniSession(now);
  const existing = await readAdr();
  if (existing?.asOf === asOf && !options.backfill5y) return existing;
  const historyCount = options.backfill5y ? 1350 : 300;
  const reference = await fetchKrxDailyCloses("005930", asOf, fetchImpl, historyCount);
  const dates = reference.map(p => p.date);
  if (dates.length < 21) throw new Error("ADR 거래일 이력 부족");
  const incremental = !options.backfill5y && existing?.asOf === dates.at(-2);
  const markets = {} as AdrPublication["markets"];
  for (const market of ["KOSPI", "KOSDAQ"] as const) {
    const codes = await listStocks(market, fetchImpl);
    const histories: KrxDailyClose[][] = [];
    const concurrency = options.backfill5y ? 16 : 8;
    for (let i = 0; i < codes.length; i += concurrency) {
      const chunk = await Promise.all(codes.slice(i, i + concurrency).map(code => loadHistory(code, asOf, incremental ? 2 : historyCount, fetchImpl)));
      histories.push(...chunk);
      if ((i + concurrency) % (concurrency * 10) === 0) console.log(`${market} ${Math.min(i + concurrency, codes.length)}/${codes.length}`);
    }
    let days = calculateAdr(incremental ? dates.slice(-2) : dates, histories);
    if (incremental && existing) {
      days = [...existing.markets[market].days, ...days];
      const latest = days.at(-1)!;
      const window = days.slice(-20);
      const down = window.reduce((n, day) => n + day.decliners, 0);
      latest.value = window.length === 20 && window.every(day => day.advancers + day.decliners + day.unchanged > 0) && down > 0
        ? window.reduce((n, day) => n + day.advancers, 0) / down * 100 : null;
    }
    if (existing && !options.backfill5y) days = mergeAdrHistory(existing.markets[market].days, days, asOf);
    if (options.backfill5y) {
      const cutoff = new Date(`${asOf}T00:00:00Z`);
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
      const start = cutoff.toISOString().slice(0, 10);
      days = days.filter(day => day.date >= start);
      const first = days.find(day => day.value != null);
      if (!first || Date.parse(`${first.date}T00:00:00Z`) - cutoff.getTime() > 14 * 86400000) throw new Error(`${market} 5년 ADR 이력 부족`);
    }
    const last = days.at(-1);
    if (!last || last.date !== asOf || last.advancers + last.decliners + last.unchanged < codes.length * 0.9 || last.value == null) throw new Error(`${market} ADR 최신 집계 누락`);
    markets[market] = { universeSize: codes.length, days };
  }
  return { version: 1, source: "NAVER_KRX_REGULAR", asOf, fetchedAt: new Date().toISOString(), membershipAt: now.toISOString(), markets };
}
export async function readAdr(): Promise<AdrPublication | null> {
  try {
    const data = JSON.parse(await fs.readFile(adrPath, "utf8")) as AdrPublication;
    if (data.version !== 1 || data.source !== "NAVER_KRX_REGULAR" || !/^\d{4}-\d{2}-\d{2}$/.test(data.asOf) || !Number.isFinite(Date.parse(data.fetchedAt)) || !["KOSPI", "KOSDAQ"].every(m => {
      const market = data.markets?.[m as "KOSPI" | "KOSDAQ"];
      return Number.isInteger(market?.universeSize) && market.universeSize > 0 && Array.isArray(market.days) && market.days.length >= 20 && market.days.at(-1)?.date === data.asOf && market.days.every((day, i, all) => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && (i === 0 || all[i - 1].date < day.date) && [day.advancers, day.decliners, day.unchanged].every(n => Number.isInteger(n) && n >= 0) && (day.value === null || Number.isFinite(day.value) && day.value >= 0));
    })) throw new Error("ADR 저장 데이터 형식 오류");
    return data;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function exportAdr(options: { backfill5y?: boolean } = {}) {
  const result = await collectAdr(new Date(), fetch, options);
  await fs.mkdir(path.dirname(adrPath), { recursive: true });
  const temp = `${adrPath}.${process.pid}.tmp`;
  try { await fs.writeFile(temp, JSON.stringify(result)); await fs.rename(temp, adrPath); } finally { await fs.unlink(temp).catch(() => undefined); }
  return result;
}
