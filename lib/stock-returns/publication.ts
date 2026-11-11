import fs from "node:fs/promises";
import path from "node:path";
import { fetchKrxDailyCloses } from "@/lib/sources/krx-daily-prices";
import { createInvestorKrxWebQuery } from "@/lib/sources/investor-flow-krx-web";
import { fetchValuationMarketCaps, type ValuationMarketCaps } from "@/lib/valuation/market-caps";

export const periods = { "1d": 1, "3d": 3, "1w": 5, "1m": 21, "3m": 63, "6m": 126, "1y": 252 } as const;
type Period = keyof typeof periods;
export type StockReturnRow = { code: string; name: string; price: number | null; marketCap: number | null; returns: Record<Period, number | null> };
export type StockReturnsPublication = { version: 1; asOf: string; fetchedAt: string; priceBasis: "KRX_REGULAR_CLOSE"; exchange: "KRX"; priceTime: "15:30 KST"; baseDates: Record<Period, string>; markets: Record<"kospi" | "kosdaq", StockReturnRow[]> };
export const stockReturnsPath = path.join(process.cwd(), "data", "stock-returns", "board.json");

export function buildStockReturns(current: ValuationMarketCaps, history: Record<string, ValuationMarketCaps>, baseDates: Record<Period, string>, now = new Date()): StockReturnsPublication {
  if (!current.securities || Object.keys(current.securities).length !== Object.keys(current.values).length) throw new Error("KRX 종목명·시장 목록 누락");
  const markets: StockReturnsPublication["markets"] = { kospi: [], kosdaq: [] };
  for (const [code, security] of Object.entries(current.securities)) {
    if (!security.name || !["KOSPI", "KOSDAQ"].includes(security.market) || !Object.hasOwn(current.values, code)) throw new Error("KRX 종목 목록 오류");
    const price = current.closes[code] ?? null;
    const returns = Object.fromEntries(Object.keys(periods).map(key => {
      const base = history[baseDates[key as Period]]?.closes[code];
      return [key, price != null && base != null && base > 0 ? (price / base - 1) * 100 : null];
    })) as StockReturnRow["returns"];
    markets[security.market === "KOSPI" ? "kospi" : "kosdaq"].push({ code, name: security.name, price, marketCap: current.values[code] ?? null, returns });
  }
  if (markets.kospi.length < 10 || markets.kosdaq.length < 10) throw new Error("KRX 시장별 종목 부족");
  return { version: 1, asOf: current.asOf, fetchedAt: now.toISOString(), priceBasis: "KRX_REGULAR_CLOSE", exchange: "KRX", priceTime: "15:30 KST", baseDates, markets };
}
export async function collectStockReturns(asOf: string): Promise<StockReturnsPublication> {
  const sessions = await fetchKrxDailyCloses("005930", asOf, fetch, 253);
  if (sessions.length < 253 || sessions.some(s => s.close == null)) throw new Error("KRX 거래일 이력 부족");
  const baseDates = Object.fromEntries(Object.entries(periods).map(([key, n]) => [key, sessions[sessions.length - 1 - n].date])) as Record<Period, string>;
  const current = await fetchValuationMarketCaps(asOf);
  const history: Record<string, ValuationMarketCaps> = {};
  // Historical cross-checks must page back far enough to reach the requested date.
  const historicalQuery = createInvestorKrxWebQuery(undefined, (code, through) => fetchKrxDailyCloses(code, through, fetch, 300), { allowInvalidRows: true });
  for (const date of new Set(Object.values(baseDates))) history[date] = await fetchValuationMarketCaps(date, historicalQuery);
  return buildStockReturns(current, history, baseDates);
}
export async function readStockReturns(): Promise<StockReturnsPublication | null> {
  try {
    const p = JSON.parse(await fs.readFile(stockReturnsPath, "utf8")) as StockReturnsPublication;
    if (p.version !== 1 || p.exchange !== "KRX" || p.priceTime !== "15:30 KST" || p.priceBasis !== "KRX_REGULAR_CLOSE" || !/^\d{4}-\d{2}-\d{2}$/.test(p.asOf) || !Number.isFinite(Date.parse(p.fetchedAt)) || !Array.isArray(p.markets?.kospi) || !Array.isArray(p.markets?.kosdaq) || !p.markets.kospi.length || !p.markets.kosdaq.length) throw new Error("종목 등락률 파일 검증 오류");
    return p;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
