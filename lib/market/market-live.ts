import type { Sector } from "@/config/sectors";

export const MARKET_LIVE_POLL_MS = 15_000;
export const MARKET_LIVE_STALE_MS = 90_000;
export const marketLiveSymbols = ["KOSPI", "KOSDAQ"] as const;
export type MarketLiveSymbol = typeof marketLiveSymbols[number];

export type MarketLiveIndex = {
  symbol: MarketLiveSymbol;
  price: number | null;
  changePct: number | null;
  asOf: string | null;
  turnover: number | null;
  breadth: { advancers: number; decliners: number; unchanged: number } | null;
  points: { time: string; value: number }[];
};
export type MarketLiveSector = { name: string; changePct: number | null; up: number; compared: number; total: number; asOf: string | null };
export type MarketLiveStock = {
  code: string;
  name: string;
  market: MarketLiveSymbol;
  sector: string;
  price: number;
  changePct: number;
  turnover: number | null;
  asOf: string;
};
export type MarketLiveMember = Pick<MarketLiveStock, "code" | "name" | "market"> & { sector: Sector };
export type MarketLiveQuote = Pick<MarketLiveStock, "code" | "price" | "turnover" | "asOf">;
export type MarketLiveRotationStock = Pick<MarketLiveStock, "code" | "market" | "sector" | "asOf"> & { price: number; close: number };
export const marketLiveRotationWindows = [10, 30, 60] as const;
export type MarketLiveRotationWindow = typeof marketLiveRotationWindows[number];
export type MarketLiveRotationData = {
  minutes: MarketLiveRotationWindow;
  from: string;
  to: string;
  rows: { name: string; nowPct: number; changePp: number; compared: number; total: number }[];
};
export type MarketLiveRadar = {
  date: string;
  baselineDate: string;
  live: boolean;
  closeAt?: string;
  windows: Partial<Record<MarketLiveRotationWindow, MarketLiveRotationData>>;
};
export type MarketLiveBoardData = {
  state: "open" | "auction" | "closed" | "unconfirmed";
  note: string | null;
  date: string;
  baselineDate: string | null;
  collectedAt: string;
  indexes: MarketLiveIndex[];
  sectors: MarketLiveSector[];
  leaders: MarketLiveStock[];
  rotationStocks: MarketLiveRotationStock[];
  breadth: { up: number; flat: number; down: number; compared: number; total: number };
  warnings: string[];
};
export type MarketLiveResponse = Omit<MarketLiveBoardData, "rotationStocks">;

export function marketLiveChange(price: number | null, close: number | undefined): number | null {
  return price != null && close != null && close > 0 ? (price / close - 1) * 100 : null;
}

export function summarizeMarketLiveStocks(
  members: MarketLiveMember[],
  quotes: MarketLiveQuote[],
  closes: ReadonlyMap<string, number>,
  minimumQuoteTime: number,
  leaderOrder: "turnover" | "change" = "turnover",
): Pick<MarketLiveBoardData, "sectors" | "leaders" | "breadth" | "rotationStocks"> {
  const byCode = new Map(quotes.map(quote => [quote.code, quote]));
  const groups = new Map<Sector, MarketLiveStock[]>();
  const sizes = new Map<Sector, number>();
  const stocks: MarketLiveStock[] = [];
  const rotationStocks: MarketLiveRotationStock[] = [];
  for (const member of members) {
    sizes.set(member.sector, (sizes.get(member.sector) ?? 0) + 1);
    const quote = byCode.get(member.code);
    if (!quote || Date.parse(quote.asOf) < minimumQuoteTime) continue;
    const close = closes.get(member.code) ?? 0;
    const changePct = marketLiveChange(quote.price, close);
    if (changePct == null) continue;
    const stock = { ...member, ...quote, changePct };
    stocks.push(stock);
    rotationStocks.push({ code: stock.code, market: stock.market, sector: stock.sector, asOf: stock.asOf, price: stock.price, close });
    const group = groups.get(member.sector) ?? [];
    group.push(stock);
    groups.set(member.sector, group);
  }
  const countUp = (rows: MarketLiveStock[]) => rows.filter(row => row.changePct > 0).length;
  const sectors = [...sizes].map(([name, total]) => {
    const rows = groups.get(name) ?? [];
    return {
      name,
      total,
      compared: rows.length,
      up: countUp(rows),
      changePct: rows.length ? rows.reduce((sum, row) => sum + row.changePct, 0) / rows.length : null,
      asOf: rows.reduce<string | null>((oldest, row) => oldest == null || Date.parse(row.asOf) < Date.parse(oldest) ? row.asOf : oldest, null),
    };
  }).sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity) || a.name.localeCompare(b.name, "ko"));
  const rank = (a: MarketLiveStock, b: MarketLiveStock) =>
    (leaderOrder === "turnover" ? (b.turnover ?? 0) - (a.turnover ?? 0) : 0) || b.changePct - a.changePct || a.code.localeCompare(b.code);
  const leaders = marketLiveSymbols.flatMap(market => stocks
    .filter(row => row.market === market && row.changePct > 0 && (leaderOrder === "change" || (row.turnover ?? 0) > 0))
    .sort(rank).slice(0, 12)).sort(rank);
  const up = countUp(stocks);
  const down = stocks.filter(row => row.changePct < 0).length;
  return { sectors, leaders, rotationStocks, breadth: { up, down, flat: stocks.length - up - down, compared: stocks.length, total: members.length } };
}
