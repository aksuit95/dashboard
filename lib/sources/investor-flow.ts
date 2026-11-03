import type { MinerviniUniverse } from "@/config/minervini";
import { minerviniUniverses } from "@/config/minervini";
import { minerviniSession } from "@/lib/market/minervini-session";
import { aggregateFlows, alignFlows, type InvestorPoint } from "@/lib/market/investor-flow";
import type { AppDatabase } from "@/lib/db/client";
import { createOpenApiQuery } from "./krx-openapi";

type Row = Record<string, unknown>;
type Query = (bld: string, params: Record<string, string>) => Promise<Row>;
export type FlowStock = { code: string; name: string; marketCap: number; price?: number; points: InvestorPoint[]; error: string | null };
export type EquityFlow = { sessions: string[]; prices: { date: string; value: number }[]; points: InvestorPoint[]; stocks: FlowStock[]; memberCount: number; collectedCount: number; error: string | null };
export type FuturesFlow = { asOf: string; flowDate: string | null; contract: { code: string; name: string; close: number } | null; points: InvestorPoint[]; error: string | null; scope: "ALL_CONTRACTS"; session: "KRX_DAY" };
export type InvestorBoard = { version: 1; universe: MinerviniUniverse; view: "index" | "stocks"; asOf: string; fetchedAt: string; priceBasis: "KRX_REGULAR_CLOSE"; quoteSource?: "KRX_OPEN_API" | "KRX_WEB"; equity: EquityFlow | null; equityError: string | null };
export const indexParams = { kospi200: { indIdx: "1", indIdx2: "028", product: "KR___FUK2I", market: "STK" }, kosdaq150: { indIdx: "2", indIdx2: "203", product: "KR___FUKQI", market: "KSQ" } };
export function krxNumber(raw: unknown): number {
  if (typeof raw !== "string" && typeof raw !== "number") throw new Error("KRX 숫자 결측");
  const text = String(raw).replace(/,/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) throw new Error("KRX 숫자 형식 오류");
  return Number(text);
}
export function krxDate(raw: unknown): string {
  const date = String(raw).replaceAll("/", "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("KRX 날짜 오류");
  return date;
}
function rows(data: Row, key = "output"): Row[] {
  const result = data[key];
  if (!Array.isArray(result) || !result.length || result.some(r => !r || typeof r !== "object")) throw new Error("KRX 통계 데이터 없음 · 인증 또는 발표 시각 확인 필요");
  return result as Row[];
}
function sorted<T extends { date: string }>(points: T[]): T[] {
  if (new Set(points.map(p => p.date)).size !== points.length) throw new Error("KRX 날짜 중복");
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
/** MDCSTAT02303: TRDVAL1..7 institutions, 9 retail, 10+11 all foreign. Won, never shares × close. */
export function parseStockFlows(data: Row, through: string): InvestorPoint[] {
  return sorted(rows(data).map(r => ({ date: krxDate(r.TRD_DD), individual: krxNumber(r.TRDVAL9),
    foreign: krxNumber(r.TRDVAL10) + krxNumber(r.TRDVAL11),
    institution: Array.from({ length: 7 }, (_, i) => krxNumber(r[`TRDVAL${i + 1}`])).reduce((a, b) => a + b, 0),
  })).filter(r => r.date <= through));
}
/** MDCSTAT13102 normal view: product totals across all expiries, contracts. */
export function parseFuturesFlows(data: Row, through: string): InvestorPoint[] {
  return sorted(rows(data).map(r => ({ date: krxDate(r.TRD_DD), individual: krxNumber(r.A09), foreign: krxNumber(r.A12), institution: krxNumber(r.A07) })).filter(r => r.date <= through));
}
export function parsePrices(data: Row, through: string) {
  const points = sorted(rows(data).map(r => ({ date: krxDate(r.TRD_DD), value: krxNumber(r.CLSPRC_IDX) })).filter(r => r.date <= through));
  if (points.at(-1)?.date !== through || points.some(r => r.value <= 0)) throw new Error(`${through} KRX 지수 종가 미반영`);
  return points.slice(-120);
}
export function parseCapitalizations(data: Row) {
  const stocks = rows(data, "OutBlock_1").map(r => {
    const code = String(r.ISU_SRT_CD), name = String(r.ISU_ABBRV ?? "");
    const marketCap = krxNumber(r.MKTCAP);
    const price = krxNumber(r.TDD_CLSPRC);
    if (!/^[0-9A-Z]{6}$/.test(code) || !name || marketCap <= 0 || price <= 0) throw new Error("KRX 시총 기준가격 결측");
    return { code, name, marketCap, price };
  });
  if (new Set(stocks.map(s => s.code)).size !== stocks.length) throw new Error("KRX 종목 중복");
  return stocks.sort((a, b) => b.marketCap - a.marketCap);
}
export function parseNearContract(data: Row, asOf: string): FuturesFlow["contract"] {
  // Official daily list contains tradable contracts on the reference session, including expiry day.
  const contracts = rows(data).map(r => {
    const name = String(r.ISU_NM ?? ""), code = String(r.ISU_SRT_CD ?? "");
    const month = name.match(/\sF\s(20\d{4})(?:\s|$)/)?.[1];
    return month && month >= asOf.slice(0, 7).replace("-", "") && code ? { code, name, rawClose: r.TDD_CLSPRC, month } : null;
  }).filter((r): r is NonNullable<typeof r> => r != null).sort((a, b) => a.month.localeCompare(b.month));
  if (!contracts.length) throw new Error("기준일 거래 가능 근월물 확인 실패");
  const { code, name, rawClose } = contracts[0];
  const close = krxNumber(rawClose);
  if (close <= 0) throw new Error("근월물 주간장 종가 없음");
  return { code, name, close };
}
function since(asOf: string) { const d = new Date(asOf); d.setUTCDate(d.getUTCDate() - 240); return d.toISOString().slice(0, 10).replaceAll("-", ""); }
const message = (e: unknown) => e instanceof Error ? e.message : "수급 수집 실패";
export async function fetchEquityFlow(universe: MinerviniUniverse, view: InvestorBoard["view"], asOf: string, query: Query, quoteOnly = false): Promise<EquityFlow> {
  const spec = indexParams[universe], endDd = asOf.replaceAll("-", "");
  // Fail authentication before launching hundreds of member requests.
  const caps = parseCapitalizations(await query("MDCSTAT01501", { trdDd: endDd, mktId: spec.market }));
  const prices = parsePrices(await query("MDCSTAT00301", { indIdx: spec.indIdx, indIdx2: spec.indIdx2, strtDd: since(asOf), endDd }), asOf);
  const sessions = prices.map(p => p.date);
  let selected = caps.slice(0, 10);
  if (quoteOnly) {
    const stocks = view === "stocks" ? selected.map(stock => ({ ...stock, points: alignFlows([], sessions), error: null })) : [];
    return { sessions, prices, points: [], stocks, memberCount: stocks.length, collectedCount: 0, error: null };
  }
  if (view === "index") {
    let members: Row[];
    try { members = rows(await query("MDCSTAT00601", { indIdx: spec.indIdx, indIdx2: spec.indIdx2, trdDd: endDd })); }
    catch (e) { return { sessions, prices, points: alignFlows([], sessions), stocks: [], memberCount: 0, collectedCount: 0, error: `지수 시세 수신 · 구성종목·수급은 별도 인증 필요: ${message(e)}` }; }
    const codes = new Set(members.map(r => String(r.ISU_SRT_CD)));
    const bounds = minerviniUniverses[universe];
    if (codes.size < bounds.minSize || codes.size > bounds.maxSize || codes.size !== members.length) throw new Error("지수 전체 구성 확인 실패");
    selected = caps.filter(s => codes.has(s.code));
    if (selected.length !== codes.size) throw new Error("구성종목 시총 누락");
  }
  if (selected.length < 10) throw new Error("시총 상위 10개 확인 실패");
  let symbols: Row[] = [], symbolsError: string | null = null;
  try { symbols = rows(await query("dbms/comm/finder/finder_stkisu", { mktsel: spec.market, searchText: "", typeNo: "0" }), "block1"); }
  catch (e) { symbolsError = message(e); }
  const isins = new Map(symbols.map(r => [String(r.short_code), String(r.full_code)]));
  const stocks: FlowStock[] = [];
  for (let i = 0; i < selected.length; i += 4) {
    stocks.push(...await Promise.all(selected.slice(i, i + 4).map(async stock => {
      try {
        if (symbolsError) throw new Error(`수급 별도 인증 필요: ${symbolsError}`);
        const isin = isins.get(stock.code);
        if (!isin || isin === "undefined") throw new Error("ISIN 확인 실패");
        const data = await query("MDCSTAT02303", { isuCd: isin, isuCd2: stock.code, strtDd: since(asOf), endDd, inqTpCd: "2", trdVolVal: "2", askBid: "3", detailView: "1" });
        const points = alignFlows(parseStockFlows(data, asOf), sessions);
        const error = points.at(-1)?.individual == null ? `${asOf} 수급 미반영` : null;
        return { ...stock, points, error };
      } catch (e) { return { ...stock, points: alignFlows([], sessions), error: message(e) }; }
    })));
  }
  const collectedCount = stocks.filter(s => !s.error).length;
  return { sessions, prices, points: aggregateFlows(stocks.map(s => s.points), sessions), stocks, memberCount: selected.length, collectedCount,
    error: collectedCount !== selected.length ? `수급 ${collectedCount}/${selected.length}개 수신 · 누락일 합산·누적은 결측 처리합니다.` : null };
}
export async function fetchFuturesFlow(universe: MinerviniUniverse, asOf: string, query: Query): Promise<FuturesFlow> {
  const spec = indexParams[universe], endDd = asOf.replaceAll("-", "");
  const contract = parseNearContract(await query("MDCSTAT12501", { trdDd: endDd, prodId: spec.product, aggBasTpCd: "0", isuOpt: "ALL" }), asOf);
  let points: InvestorPoint[] = [], error: string | null = null;
  try {
    points = parseFuturesFlows(await query("MDCSTAT13102", { isuCd: spec.product, prodId: spec.product, strtDd: since(asOf), endDd, inqTpCd: "2", prtType: "QTY", prtCheck: "SUN", aggBasTpCd: "0", isuOpt: "ALL" }), asOf);
    if (points.at(-1)?.date !== asOf) error = `${asOf} 선물 수급 미발표 · 최종 매매내역은 18:00 이후 제공`;
  } catch (e) { error = message(e); }
  const flowDate = points.at(-1)?.date ?? null;
  try {
    const prices = parsePrices(await query("MDCSTAT00301", { indIdx: spec.indIdx, indIdx2: spec.indIdx2, strtDd: since(asOf), endDd }), asOf);
    points = alignFlows(points, prices.map(p => p.date));
  } catch (e) { points = []; error = [error, `거래일 기준 확인 불가: ${message(e)}`].filter(Boolean).join(" · "); }
  return { asOf, flowDate, contract, points, error, scope: "ALL_CONTRACTS", session: "KRX_DAY" };
}

const pending = new Map<string, Promise<InvestorBoard>>();
const failed = new Map<string, { until: number; board: InvestorBoard }>();
export async function loadInvestorBoard(db: AppDatabase, universe: MinerviniUniverse, view: InvestorBoard["view"], now = new Date()): Promise<InvestorBoard> {
  const asOf = minerviniSession(now), key = `${universe}:${view}:${asOf}:quotes-v3`;
  db.exec("CREATE TABLE IF NOT EXISTS investor_flow_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL)");
  const useOpenApi = true;
  const sourceQuery = createOpenApiQuery(db, async () => { throw new Error("지원하지 않는 시세 조회"); });
  const query: Query = async (bld, params) => {
    const cacheKey = JSON.stringify([2, useOpenApi ? "KRX_OPEN_API" : "KRX_WEB", asOf, bld, params, "KRX_REGULAR_CLOSE"]);
    const saved = db.prepare("SELECT payload FROM investor_flow_cache WHERE cache_key = ?").get(cacheKey) as { payload: string } | undefined;
    if (saved) return JSON.parse(saved.payload) as Row;
    const result = await sourceQuery(bld, params);
    // Validate before persistence so malformed, late, or incomplete responses cannot poison retries.
    let cacheable = true;
    if (bld === "MDCSTAT01501") parseCapitalizations(result);
    if (bld === "MDCSTAT00301") parsePrices(result, asOf);
    if (bld === "MDCSTAT02303") cacheable = parseStockFlows(result, asOf).at(-1)?.date === asOf;
    if (bld === "MDCSTAT13102") cacheable = parseFuturesFlows(result, asOf).at(-1)?.date === asOf;
    if (bld === "MDCSTAT12501") parseNearContract(result, asOf);
    // Cache only nonempty tables. Today's futures totals remain refreshable until final publication.
    if (cacheable && Object.values(result).some(v => Array.isArray(v) && v.length) && !(["MDCSTAT13102", "MDCSTAT02303"].includes(bld) && now.getTime() < Date.parse(`${asOf}T18:10:00+09:00`))) {
      db.prepare("INSERT OR REPLACE INTO investor_flow_cache(cache_key, payload) VALUES (?, ?)").run(cacheKey, JSON.stringify(result));
    }
    return result;
  };
  if (failed.get(key) && failed.get(key)!.until > Date.now()) return failed.get(key)!.board;
  const existing = pending.get(key); if (existing) return existing;
  const work = (async () => {
    const [equity] = await Promise.allSettled([fetchEquityFlow(universe, view, asOf, query, true)]);
    const board: InvestorBoard = { version: 1, universe, view, asOf, fetchedAt: new Date().toISOString(), priceBasis: "KRX_REGULAR_CLOSE",
      quoteSource: useOpenApi ? "KRX_OPEN_API" : "KRX_WEB", equity: equity.status === "fulfilled" ? equity.value : null, equityError: equity.status === "rejected" ? message(equity.reason) : null };
    if (board.equityError || board.equity?.error) failed.set(key, { until: Date.now() + 60_000, board });
    return board;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}
