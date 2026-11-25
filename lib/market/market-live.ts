import type { Sector } from "@/config/sectors";

export const MARKET_LIVE_POLL_MS = 15_000;
export const MARKET_LIVE_STALE_MS = 90_000;
export const MARKET_LIVE_CLOSE_LEADER_LIMIT = 20;
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
export type MarketLiveBuyStrengthStock = MarketLiveStock & {
  marketCap: number;
  buyStrengthPct: number;
};
export type MarketLiveClosingSnapshot = {
  date: string;
  baselineDate: string;
  basis: "KRX_REGULAR_CLOSE";
  collectedAt: string;
  stocks: { code: string; price: number; turnover: number; baselineClose?: number; marketCap?: number }[];
};
export type MarketLiveMember = Pick<MarketLiveStock, "code" | "name" | "market"> & { sector: Sector };
export type MarketLiveQuote = Pick<MarketLiveStock, "code" | "price" | "turnover" | "asOf">;
export type MarketLiveRotationStock = Pick<MarketLiveStock, "code" | "market" | "sector" | "asOf"> & { price: number; close: number };
export type MarketLiveSectorStock = Pick<MarketLiveMember, "code" | "name" | "market"> & {
  price: number | null;
  changePct: number | null;
  asOf: string | null;
};
export const marketLiveRotationWindows = [10, 30, 60] as const;
export type MarketLiveRotationWindow = typeof marketLiveRotationWindows[number];
export type MarketLiveRotationData = {
  minutes: MarketLiveRotationWindow;
  from: string;
  to: string;
  rows: { name: string; nowPct: number; changePp: number; compared: number; total: number; up?: number }[];
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
  updatedAt?: string | null;
  indexes: MarketLiveIndex[];
  sectors: MarketLiveSector[];
  leaders: MarketLiveStock[];
  buyStrengthLeaders?: MarketLiveBuyStrengthStock[];
  closingSnapshot?: MarketLiveClosingSnapshot;
  rotationStocks: MarketLiveRotationStock[];
  sectorStocks?: (MarketLiveSectorStock & { sector: Sector })[];
  breadth: { up: number; flat: number; down: number; compared: number; total: number };
  warnings: string[];
};
export type MarketLiveResponse = Omit<MarketLiveBoardData, "rotationStocks" | "sectorStocks" | "closingSnapshot"> & {
  sectorStocks: NonNullable<MarketLiveBoardData["sectorStocks"]>;
};

export function marketLiveChange(price: number | null, close: number | undefined): number | null {
  return price != null && close != null && close > 0 ? (price / close - 1) * 100 : null;
}

export function summarizeMarketLiveStocks(
  members: MarketLiveMember[],
  quotes: MarketLiveQuote[],
  closes: ReadonlyMap<string, number>,
  minimumQuoteTime: number,
  leaderOrder: "turnover" | "change" = "turnover",
  marketCaps?: ReadonlyMap<string, number>,
): Pick<MarketLiveBoardData, "sectors" | "leaders" | "buyStrengthLeaders" | "breadth" | "rotationStocks" | "sectorStocks"> {
  const byCode = new Map(quotes.map(quote => [quote.code, quote]));
  const groups = new Map<Sector, MarketLiveStock[]>();
  const sizes = new Map<Sector, number>();
  const stocks: MarketLiveStock[] = [];
  const rotationStocks: MarketLiveRotationStock[] = [];
  const sectorStocks: NonNullable<MarketLiveBoardData["sectorStocks"]> = [];
  for (const member of members) {
    sizes.set(member.sector, (sizes.get(member.sector) ?? 0) + 1);
    const quote = byCode.get(member.code);
    const fresh = quote && Date.parse(quote.asOf) >= minimumQuoteTime ? quote : undefined;
    const close = closes.get(member.code);
    const changePct = marketLiveChange(fresh?.price ?? null, close);
    sectorStocks.push({ ...member, price: fresh?.price ?? null, changePct, asOf: fresh?.asOf ?? null });
    if (!fresh || close === undefined || changePct == null) continue;
    const stock = { ...member, ...fresh, changePct };
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
  const leaderLimit = leaderOrder === "change" ? MARKET_LIVE_CLOSE_LEADER_LIMIT : 12;
  const leaders = marketLiveSymbols.flatMap(market => stocks
    .filter(row => row.market === market && row.changePct > 0 && (leaderOrder === "change" || (row.turnover ?? 0) > 0))
    .sort(rank).slice(0, leaderLimit)).sort(rank);
  const buyStrengthLeaders = marketCaps && rankBuyStrength(stocks, marketCaps, leaderLimit);
  const up = countUp(stocks);
  const down = stocks.filter(row => row.changePct < 0).length;
  return { sectors, leaders, buyStrengthLeaders, rotationStocks, sectorStocks, breadth: { up, down, flat: stocks.length - up - down, compared: stocks.length, total: members.length } };
}

function rankBuyStrength(stocks: MarketLiveStock[], marketCaps: ReadonlyMap<string, number>, limit: number) {
  const eligible = stocks.flatMap(stock => {
    const marketCap = marketCaps.get(stock.code);
    if (stock.changePct <= 0 || stock.turnover == null || !Number.isFinite(stock.turnover) || stock.turnover <= 0 ||
        marketCap == null || !Number.isFinite(marketCap) || marketCap <= 0) return [];
    return [{ ...stock, marketCap, buyStrengthPct: stock.turnover / marketCap * 100 }];
  });
  const rank = (a: MarketLiveBuyStrengthStock, b: MarketLiveBuyStrengthStock) =>
    b.buyStrengthPct - a.buyStrengthPct || b.changePct - a.changePct || a.code.localeCompare(b.code);
  return marketLiveSymbols.flatMap(market => eligible.filter(stock => stock.market === market).sort(rank).slice(0, limit)).sort(rank);
}
