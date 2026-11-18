import type { MarketLiveArchiveFrame } from "./market-live-archive";
import type { MarketLiveRotationData, MarketLiveRotationWindow } from "./market-live";

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
  const { from, through } = marketLiveRotationBounds(Date.parse(current.collectedAt), minutes);
  const earlierAt = Date.parse(base.collectedAt);
  if (!(earlierAt >= from && earlierAt <= through)) return null;

  const earlier = new Map(base.stocks.map(stock => [`${stock.market}:${stock.code}`, stock]));
  const matched = new Map<string, { count: number; nowPct: number; changePp: number }>();
  for (const stock of current.stocks) {
    const prior = earlier.get(`${stock.market}:${stock.code}`);
    if (!prior || stock.sector !== prior.sector || stock.close !== prior.close || !(Date.parse(stock.asOf) > Date.parse(prior.asOf))) continue;
    const group = matched.get(stock.sector) ?? { count: 0, nowPct: 0, changePp: 0 };
    group.count++;
    group.nowPct += (stock.price / stock.close - 1) * 100;
    group.changePp += (stock.price - prior.price) / stock.close * 100;
    matched.set(stock.sector, group);
  }
  const previousTotals = new Map(base.sectors.map(sector => [sector.name, sector.total]));
  const rows = current.sectors.flatMap(({ name, total }) => {
    const sector = matched.get(name);
    const minimumCount = Math.max(2, Math.ceil(Math.max(total, previousTotals.get(name) ?? 0) / 2));
    return sector && sector.count >= minimumCount ? [{
      name, total, compared: sector.count, nowPct: sector.nowPct / sector.count, changePp: sector.changePp / sector.count,
    }] : [];
  });
  return rows.length ? { minutes, from: base.collectedAt, to: current.collectedAt, rows } : null;
}
