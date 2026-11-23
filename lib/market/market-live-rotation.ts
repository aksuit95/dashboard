import { marketLiveFrameTime, type MarketLiveArchiveFrame, type MarketLiveArchiveResponse } from "./market-live-archive";
import { marketLiveRotationWindows, type MarketLiveRadar, type MarketLiveRotationData, type MarketLiveRotationWindow } from "./market-live";

const maximumDelayMs = 90_000;

export function marketLiveRotationBounds(collectedAt: number, minutes: MarketLiveRotationWindow) {
  const through = collectedAt - minutes * 60_000;
  return { from: through - maximumDelayMs, through };
}

export function compareMarketLiveRotation(
  base: MarketLiveArchiveFrame,
  current: MarketLiveArchiveFrame,
  minutes: MarketLiveRotationWindow,
): MarketLiveRotationData | null {
  const { from, through } = marketLiveRotationBounds(Date.parse(marketLiveFrameTime(current)), minutes);
  const earlierAt = Date.parse(marketLiveFrameTime(base));
  if (!(earlierAt >= from && earlierAt <= through)) return null;

  const earlier = new Map(base.stocks.map(stock => [`${stock.market}:${stock.code}`, stock]));
  const matched = new Map<string, { count: number; up: number; nowPct: number; changePp: number }>();
  for (const stock of current.stocks) {
    const prior = earlier.get(`${stock.market}:${stock.code}`);
    if (!prior || stock.sector !== prior.sector || stock.close !== prior.close || !(Date.parse(stock.asOf) > Date.parse(prior.asOf))) continue;
    const group = matched.get(stock.sector) ?? { count: 0, up: 0, nowPct: 0, changePp: 0 };
    group.count++;
    group.up += Number(stock.price > prior.price);
    group.nowPct += (stock.price / stock.close - 1) * 100;
    group.changePp += (stock.price - prior.price) / stock.close * 100;
    matched.set(stock.sector, group);
  }
  const previousTotals = new Map(base.sectors.map(sector => [sector.name, sector.total]));
  const rows = current.sectors.flatMap(({ name, total }) => {
    const sector = matched.get(name);
    const minimumCount = Math.max(2, Math.ceil(Math.max(total, previousTotals.get(name) ?? 0) / 2));
    return sector && sector.count >= minimumCount ? [{
      name, total, compared: sector.count, up: sector.up, nowPct: sector.nowPct / sector.count, changePp: sector.changePp / sector.count,
    }] : [];
  });
  return rows.length ? { minutes, from: marketLiveFrameTime(base), to: marketLiveFrameTime(current), rows } : null;
}

export function calculateMarketLiveRadar(
  date: string,
  baselineDate: string,
  current: MarketLiveArchiveFrame,
  live: boolean,
  readEarlier: (from: number, through: number) => MarketLiveArchiveFrame | null,
): MarketLiveRadar {
  const windows: MarketLiveRadar["windows"] = {};
  const time = Date.parse(marketLiveFrameTime(current));
  for (const minutes of marketLiveRotationWindows) {
    const { from, through } = marketLiveRotationBounds(time, minutes);
    let candidateThrough = through;
    while (candidateThrough >= from) {
      const earlier = readEarlier(from, candidateThrough);
      if (!earlier) break;
      const at = Date.parse(marketLiveFrameTime(earlier));
      if (!(at >= from && at <= candidateThrough)) break;
      const comparison = compareMarketLiveRotation(earlier, current, minutes);
      if (comparison) windows[minutes] = comparison;
      if (comparison || live) break;
      // A thin auction frame can leave an earlier frame in the allowed window usable.
      candidateThrough = at - 1;
    }
  }
  return { date, baselineDate, live, windows };
}

/** Rebuild the comparison frame from the per-stock tape shipped with the archive. */
export function calculateMarketLiveCloseRadar(day: NonNullable<MarketLiveArchiveResponse["day"]>, closing: MarketLiveArchiveFrame): MarketLiveRadar | null {
  const tape = day.stockTape;
  if (!tape) return null;
  return {
    ...calculateMarketLiveRadar(day.date, day.baselineDate, closing, false, (from, through) => {
      const frame = day.frames.findLast(item => {
        const time = Date.parse(marketLiveFrameTime(item));
        return time >= from && time <= through;
      });
      if (!frame) return null;
      const asOf = marketLiveFrameTime(frame);
      const slot = Math.floor((Date.parse(asOf) - tape.openAt) / 60_000);
      const stocks = tape.stocks.flatMap(row => {
        const price = row.prices[slot];
        const close = row.correctedCloses?.[slot] ?? row.close;
        return price != null && Number.isFinite(price) && price > 0 && Number.isFinite(close) && close > 0
          ? [{ code: row.code, market: row.market, sector: row.sector, price, close, asOf }] : [];
      });
      return { ...frame, stocks };
    }),
    closeAt: marketLiveFrameTime(closing),
  };
}
