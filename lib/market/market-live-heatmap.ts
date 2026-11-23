import { marketLiveFrameTime, type MarketLiveArchiveResponse } from "./market-live-archive";
import type { MarketLiveSectorStock } from "./market-live";
import { marketLiveTradingWindow } from "./market-live-session";

export type MarketLiveHeatmapDay = NonNullable<MarketLiveArchiveResponse["day"]>;
type StockTape = NonNullable<MarketLiveHeatmapDay["stockTape"]>;
type SectorMove = {
  name: string;
  up: number;
  compared: number;
  total: number;
  changePct: number | null;
  relativePp: number | null;
};
export type MarketLiveHeatmapInterval = {
  start: number;
  end: number;
  scheduledEnd: number;
  marketPct: number | null;
  sectors: ReadonlyMap<string, SectorMove>;
};

const minute = 60_000;
const intervalLength = 10 * minute;

function priceAt(row: StockTape["stocks"][number], slot: number) {
  const price = row.prices[slot];
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}

function compareStock(row: StockTape["stocks"][number], first: number, last: number) {
  const opening = priceAt(row, first);
  const price = priceAt(row, last);
  return { price, changePct: opening != null && price != null ? (price - opening) / opening * 100 : null };
}

function compareInterval(tape: StockTape, totals: ReadonlyMap<string, number>, start: number, end: number, scheduledEnd: number): MarketLiveHeatmapInterval {
  const first = (start - tape.openAt) / minute;
  const last = (end - tape.openAt) / minute;
  const groups = new Map<string, { compared: number; up: number; sum: number }>();
  let marketSum = 0;
  let marketCompared = 0;
  for (const stock of tape.stocks) {
    const { changePct } = compareStock(stock, first, last);
    if (changePct === null) continue;
    const group = groups.get(stock.sector) ?? { compared: 0, up: 0, sum: 0 };
    group.compared++;
    group.up += Number(changePct > 0);
    group.sum += changePct;
    groups.set(stock.sector, group);
    marketSum += changePct;
    marketCompared++;
  }
  const marketTotal = [...totals.values()].reduce((sum, count) => sum + count, 0);
  const marketPct = marketCompared >= Math.max(2, Math.ceil(marketTotal / 2)) ? marketSum / marketCompared : null;
  const sectors = new Map<string, SectorMove>();
  for (const [name, total] of totals) {
    const { compared, up, sum } = groups.get(name) ?? { compared: 0, up: 0, sum: 0 };
    const changePct = compared >= Math.max(2, Math.ceil(total / 2)) ? sum / compared : null;
    const relativePp = changePct != null && marketPct != null ? changePct - marketPct : null;
    sectors.set(name, { name, total, compared, up, changePct, relativePp });
  }
  return { start, end, scheduledEnd, marketPct, sectors };
}

export function buildMarketLiveHeatmap(day: MarketLiveHeatmapDay) {
  const tape = day.stockTape;
  const session = marketLiveTradingWindow(day.date);
  if (!session || tape?.openAt !== session.openAt || !tape.stocks.length) return null;
  const { openAt, closeAt } = session;
  const totals = new Map<string, number>();
  let through = openAt;
  for (const frame of day.frames) {
    const time = Date.parse(marketLiveFrameTime(frame));
    if (!(time >= openAt && time <= closeAt)) continue;
    through = Math.max(through, Math.floor(time / minute) * minute);
    for (const { name, total } of frame.sectors) totals.set(name, Math.max(totals.get(name) ?? 0, total));
  }
  const tapeTotals = new Map<string, number>();
  for (const { sector } of tape.stocks) tapeTotals.set(sector, (tapeTotals.get(sector) ?? 0) + 1);
  for (const [name, total] of tapeTotals) totals.set(name, Math.max(totals.get(name) ?? 0, total));

  const intervals: MarketLiveHeatmapInterval[] = [];
  for (let start = openAt; start < through; start += intervalLength) {
    const scheduledEnd = Math.min(start + intervalLength, closeAt);
    intervals.push(compareInterval(tape, totals, start, Math.min(scheduledEnd, through), scheduledEnd));
  }
  const names = [...totals.keys()].sort((a, b) => a.localeCompare(b, "ko"));
  return { intervals, names, through, closeAt };
}

export function marketLiveIntervalStocks(tape: StockTape, interval: MarketLiveHeatmapInterval, sector: string): MarketLiveSectorStock[] {
  const first = (interval.start - tape.openAt) / minute;
  const last = (interval.end - tape.openAt) / minute;
  return tape.stocks.filter(row => row.sector === sector).map(row => ({
    code: row.code, name: row.name ?? row.code, market: row.market,
    ...compareStock(row, first, last), asOf: null,
  }));
}
