import { marketLiveChange, type MarketLiveBoardData, type MarketLiveRadar, type MarketLiveRotationStock, type MarketLiveSector } from "./market-live";

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

type MinuteLeader = { time: number; name: string | undefined };
type HourlyLead = { name: string; minutes: number; firstAt: number; lastAt: number };
export type MarketLiveHourlyLeader = { start: number; end: number; observed: number; lead: HourlyLead | null };

export function summarizeMarketLiveHourlyLeaders(minutes: readonly MinuteLeader[], openAt: number, closeAt: number): MarketLiveHourlyLeader[] {
  const hour = 60 * 60_000;
  const latest = minutes.at(-1)?.time ?? openAt - 1;
  const lastMinute = Math.min(closeAt - 1, latest);
  const count = lastMinute < openAt ? 0 : Math.floor((lastMinute - openAt) / hour) + 1;
  const hours = Array.from({ length: count }, (_, index) => {
    const start = openAt + index * hour;
    return { start, end: Math.min(start + hour, closeAt), observed: 0, leaders: new Map<string, HourlyLead>() };
  });
  for (const { time, name } of minutes) {
    // The closing snapshot remains in the replay, but adds no minute to the session.
    if (!name || time < openAt || time >= closeAt) continue;
    const period = hours[Math.floor((time - openAt) / hour)];
    const lead = period.leaders.get(name) ?? { name, minutes: 0, firstAt: time, lastAt: time };
    lead.minutes++;
    lead.lastAt = time;
    period.leaders.set(name, lead);
    period.observed++;
  }
  return hours.map(({ leaders, ...period }) => ({
    ...period, lead: [...leaders.values()].sort((a, b) => b.minutes - a.minutes || b.lastAt - a.lastAt)[0] ?? null,
  }));
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

export function marketLiveClosingFrame(
  board: MarketLiveBoardData,
  session: { date: string; baselineDate: string; closeAt: number },
): MarketLiveArchiveFrame | null {
  if (board.state !== "closed" || board.date !== session.date || board.baselineDate !== session.baselineDate ||
      !board.rotationStocks.length || board.rotationStocks.some(stock => Date.parse(stock.asOf) !== session.closeAt)) return null;
  return {
    collectedAt: board.collectedAt,
    minuteAt: new Date(session.closeAt).toISOString(),
    sectors: board.sectors,
    stocks: board.rotationStocks,
  };
}

export function appendMarketLiveClosingFrame(
  day: NonNullable<MarketLiveArchiveResponse["day"]>,
  closing: MarketLiveArchiveFrame,
): NonNullable<MarketLiveArchiveResponse["day"]> {
  const { stocks: _stocks, ...frame } = closing;
  const closeAt = Date.parse(marketLiveFrameTime(frame));
  return { ...day, frames: [...day.frames.filter(point => Date.parse(marketLiveFrameTime(point)) < closeAt), frame] };
}

export type MarketLiveSectorResponse = MarketLiveArchiveResponse & {
  radar: MarketLiveRadar | null;
  coverage?: { compared: number; total: number };
  warning?: string;
};
