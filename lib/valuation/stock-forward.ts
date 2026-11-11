import type { MinerviniBar } from '@/lib/market/minervini';
import type { StockHistoryPoint } from './stock-history';

export type ForwardKind = 'per' | 'pbr';
export type ForwardPoint = { date: string; price: number; denominator: number; ratio: number };

/** Match only explicitly dated estimates and closes; never carry them over missing dates. */
export function matchForwardHistory(points: StockHistoryPoint[], bars: MinerviniBar[], kind: ForwardKind): ForwardPoint[] {
  const prices = new Map(bars.filter(b => Number.isFinite(b.close) && b.close > 0).map(b => [b.date, b.close]));
  const matched = new Map<string, ForwardPoint>();
  for (const point of points) {
    const date = kind === 'per' ? point.epsBaseDate : point.bpsBaseDate;
    const denominator = kind === 'per' ? point.values.eps : point.values.bps;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(denominator) || denominator == null || denominator === 0) continue;
    const price = prices.get(date);
    if (price == null) continue;
    matched.set(date, { date, price, denominator, ratio: price / denominator });
  }
  return [...matched.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function forwardBandLevels(points: ForwardPoint[]): number[] {
  const ratios = points.filter(point => point.denominator > 0 && point.ratio > 0).map(point => point.ratio).sort((a, b) => a - b);
  if (ratios.length < 2) return [];
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return [0.5, 0.75, 1, 1.25, 1.5].map(factor => Math.round(median * factor * 100) / 100);
}
