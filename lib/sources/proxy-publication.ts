import fs from "node:fs/promises";
import path from "node:path";
import { minerviniSession } from "@/lib/market/minervini-session";
import { usRefreshDate } from "@/lib/market/daily-close";
import { adrPremiumSeries, latestAdrPremium, type CloseBar } from "@/lib/market/adr-premium";
import { preferredDiscountSeries } from "@/lib/market/preferred-discount";
import { fetchKrxDailyCloses } from "./krx-daily-prices";
import { requestKrxOpenApi } from "./krx-openapi";
import { fetchYahooHistory } from "./yahoo";
import { fetchUsRegularClose } from "./us-regular-close";

type KrSymbol = "005930" | "005935" | "000660";
const codes: KrSymbol[] = ["005930", "005935", "000660"];
type Publication = { version: 1; priceBasis: "KRX_REGULAR_CLOSE"; krAsOf: string; usAsOf: string; fetchedAt: string; krFetchedAt: string; usFetchedAt: string; krSource?: "KRX_OPEN_API" | "NAVER_KRX_REGULAR";
  kr: Record<KrSymbol, CloseBar[]>; adr: CloseBar[]; fx: CloseBar[] };
export const proxyPublicationPath = path.join(process.cwd(), "data", "proxy-close", "board.json");

export function validateProxyPublication(value: unknown): Publication {
  const p = value as Publication;
  if (p?.version !== 1 || p.priceBasis !== "KRX_REGULAR_CLOSE" || !/^\d{4}-\d{2}-\d{2}$/.test(p.krAsOf) || !/^\d{4}-\d{2}-\d{2}$/.test(p.usAsOf) || ![p.fetchedAt, p.krFetchedAt, p.usFetchedAt].every(value => Number.isFinite(Date.parse(value)))) throw new Error("프록시 배포 기준 형식 오류");
  const valid = (bars: CloseBar[], through: string) => Array.isArray(bars) && bars.length > 0 && bars.every((bar, i) => /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && bar.date <= through && Number.isFinite(bar.close) && bar.close > 0 && (i === 0 || bars[i - 1].date < bar.date));
  if (codes.some(code => !valid(p.kr?.[code], p.krAsOf) || p.kr[code].at(-1)?.date !== p.krAsOf) || !valid(p.adr, p.usAsOf) || !valid(p.fx, p.usAsOf)) throw new Error("프록시 종가 이력 누락·기준일 오류");
  return p;
}
export async function readProxyPublication(file = proxyPublicationPath) {
  try { return validateProxyPublication(JSON.parse(await fs.readFile(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function publishedProxyClose(file = proxyPublicationPath) {
  const p = await readProxyPublication(file);
  if (!p) throw new Error("프록시 종가 수집·배포 대기 중입니다.");
  const samsung = preferredDiscountSeries(p.kr["005930"], p.kr["005935"]);
  const input = { common: p.kr["000660"], adr: p.adr, usdkrw: p.fx, sharesPerReceipt: 0.1 };
  const adr = adrPremiumSeries({ ...input, atLatestClose: true });
  const latest = latestAdrPremium(input);
  if (latest) { const index = adr.findIndex(point => point.date === latest.date); if (index >= 0) adr[index] = latest; else adr.push(latest); }
  if (!samsung.length || !adr.length) throw new Error("프록시 종가 비교 자료 없음");
  return { closeDate: p.krAsOf, usAsOf: p.usAsOf, fetchedAt: p.fetchedAt, krFetchedAt: p.krFetchedAt, usFetchedAt: p.usFetchedAt, priceBasis: p.priceBasis, krSource: p.krSource ?? "KRX_OPEN_API", samsung, adr: adr.map(point => ({ ...point, value: point.premium })) };
}

type Dependencies = { krx: typeof requestKrxOpenApi; history: typeof fetchKrxDailyCloses; yahoo: typeof fetchYahooHistory; regularClose?: typeof fetchUsRegularClose };
const defaults: Dependencies = { krx: requestKrxOpenApi, history: fetchKrxDailyCloses, yahoo: fetchYahooHistory, regularClose: fetchUsRegularClose };
export async function exportProxyPublication(file = proxyPublicationPath, now = new Date(), dep: Dependencies = defaults, options: { usOnly?: boolean } = {}) {
  const previous = await readProxyPublication(file);
  if (options.usOnly && !previous) throw new Error("미국 ADR 수집 전에 검증된 KRX 종가 저장본이 필요합니다.");
  const krAsOf = options.usOnly ? previous!.krAsOf : minerviniSession(now), usAsOf = usRefreshDate(now);
  if (previous && (previous.krAsOf > krAsOf || previous.usAsOf > usAsOf)) throw new Error("프록시 기준일 역행");
  if (previous?.krAsOf === krAsOf && previous.usAsOf === usAsOf) return { changed: false, krAsOf, usAsOf };
  let krFetchedAt = previous?.krFetchedAt, usFetchedAt = previous?.usFetchedAt;
  let krSource: Publication["krSource"] = previous?.krSource ?? "KRX_OPEN_API";
  let kr = previous?.kr;
  if (!kr || previous?.krAsOf !== krAsOf) {
    let latest: Record<KrSymbol, number> | null = null;
    try {
      const rows = await dep.krx("sto/stk_bydd_trd", krAsOf.replaceAll("-", ""));
      latest = Object.fromEntries(codes.map(code => {
        const matched = rows.filter(row => row.ISU_CD === code);
        if (matched.length !== 1) throw new Error(`${code} KRX 종가 누락·중복`);
        const raw = String(matched[0].TDD_CLSPRC ?? "").replaceAll(",", "");
        const close = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
        if (!(close > 0)) throw new Error(`${code} KRX 종가 오류`);
        return [code, close];
      })) as Record<KrSymbol, number>;
      krSource = "KRX_OPEN_API";
    } catch (error) {
      // Network failure or not-yet-published KRX data: use the explicit KRX regular-close field only.
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("KRX Open API 네트워크 오류") && !message.includes("KRX Open API 데이터 없음")) throw error;
      krSource = "NAVER_KRX_REGULAR";
    }
    const entries = await Promise.all(codes.map(async code => {
      // Refresh verified regular-close history to fill any missed sessions.
      const history = (await dep.history(code, krAsOf, fetch, 1500)).filter((bar): bar is CloseBar => bar.close != null);
      const existing = history.find(bar => bar.date === krAsOf);
      if (!existing) throw new Error(`${code} ${krAsOf} KRX 정규장 종가 누락`);
      if (latest && existing.close !== latest[code]) throw new Error(`${code} KRX 종가 이력 불일치`);
      return [code, [...history.filter(bar => bar.date < krAsOf), { date: krAsOf, close: latest?.[code] ?? existing.close }].slice(-1500)] as const;
    }));
    krFetchedAt = now.toISOString();
    kr = Object.fromEntries(entries) as Record<KrSymbol, CloseBar[]>;
  }
  let adr = previous?.adr, fx = previous?.fx;
  if (!adr || !fx || previous?.usAsOf !== usAsOf) {
    const [a, f] = await Promise.all([dep.yahoo("SKHY", "5y"), dep.yahoo("KRW=X", "5y")]);
    if (a.status !== "ok" || f.status !== "ok") throw new Error("미국 ADR·환율 이력 수집 실패");
    adr = a.data.filter(bar => bar.date <= usAsOf && bar.close > 0).map(({ date, close }) => ({ date, close }));
    if (adr.at(-1)?.date !== usAsOf && dep.regularClose) {
      const regular = await dep.regularClose("SKHY", usAsOf, now);
      if (regular) adr.push(regular);
    }
    fx = f.data.filter(bar => bar.date <= usAsOf && bar.close > 0).map(({ date, close }) => ({ date, close }));
    usFetchedAt = now.toISOString();
    if (adr.at(-1)?.date !== usAsOf) throw new Error(`${usAsOf} 미국 ADR 종가 미반영`);
  }
  const p = validateProxyPublication({ version: 1, priceBasis: "KRX_REGULAR_CLOSE", krAsOf, usAsOf, fetchedAt: now.toISOString(), krFetchedAt, usFetchedAt, krSource, kr, adr, fx });
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(p) + "\n", { flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
  return { changed: true, krAsOf, usAsOf };
}
