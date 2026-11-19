import { marketLiveChange, type MarketLiveRadar, type MarketLiveRotationStock, type MarketLiveSector } from "./market-live";

export const MARKET_LIVE_SECTOR_REFRESH_SECONDS = 180;

export type MarketLiveArchiveFrame = {
  collectedAt: string;
  minuteAt?: string;
  sectors: MarketLiveSector[];
  stocks: MarketLiveRotationStock[];
};

export function marketLiveFrameTime(frame: Pick<MarketLiveArchiveFrame, "collectedAt" | "minuteAt">) {
  return frame.minuteAt ?? frame.collectedAt;
}

export function summarizeMarketLiveArchiveSectors(
  totals: ReadonlyMap<string, number>,
  stocks: MarketLiveRotationStock[],
  minimumCoverage = 0,
): MarketLiveSector[] {
  const groups = new Map<string, { count: number; up: number; change: number; oldest: number }>();
  for (const stock of stocks) {
    const change = marketLiveChange(stock.price, stock.close);
    if (change === null) continue;
    const quoted = Date.parse(stock.asOf);
    const group = groups.get(stock.sector) ?? { count: 0, up: 0, change: 0, oldest: quoted };
    group.count++;
    group.up += Number(change > 0);
    group.change += change;
    group.oldest = Math.min(group.oldest, quoted);
    groups.set(stock.sector, group);
  }
  return [...totals].map(([name, total]) => {
    const group = groups.get(name);
    return {
      name, total, changePct: group && group.count >= total * minimumCoverage ? group.change / group.count : null,
      up: group?.up ?? 0, compared: group?.count ?? 0, asOf: group ? new Date(group.oldest).toISOString() : null,
    };
  });
}

export type MarketLiveArchiveDay = {
  date: string;
  baselineDate: string;
  frames: MarketLiveArchiveFrame[];
};

export type MarketLiveArchiveResponse = {
  dates: string[];
  day: Omit<MarketLiveArchiveDay, "frames"> & {
    frames: Omit<MarketLiveArchiveFrame, "stocks">[];
  } | null;
};

export type MarketLiveSectorResponse = MarketLiveArchiveResponse & {
  radar: MarketLiveRadar | null;
  warning?: string;
};
