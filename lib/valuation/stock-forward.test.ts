import { describe, expect, it } from 'vitest';
import type { MinerviniBar } from '@/lib/market/minervini';
import type { StockHistoryPoint } from './stock-history';
import { forwardBandLevels, matchForwardHistory } from './stock-forward';

const bar = (date: string, close: number): MinerviniBar => ({ date, open: close, high: close, low: close, close, volume: 1 });
const point = (date: string, eps: number, bps: number, epsBaseDate?: string, bpsBaseDate?: string): StockHistoryPoint => ({date, sourceUpdatedAt: `${date} 12:00:00`, baseDate: 'CPD-1TD', values: {eps, bps}, epsBaseDate, bpsBaseDate});

describe('forward valuation', () => {
  it('matches only exact validated price dates and uses the separate EPS and BPS dates', () => {
    const bars = [bar('2026-11-03', 100), bar('2026-11-04', 120)];
    const points = [point('2026-11-05', 10, 50, '2026-11-03', '2026-11-04'), point('2026-11-06', 8, 40), point('2026-11-07', 0, 50, '2026-11-04', '2026-11-07')];
    expect(matchForwardHistory(points, bars, 'per')).toEqual([{date:'2026-11-03', price:100, denominator:10, ratio:10}]);
    expect(matchForwardHistory(points, bars, 'pbr')).toEqual([{date:'2026-11-04', price:120, denominator:50, ratio:2.4}]);
  });
  it('forms bands around median of positive observations only', () => {
    const points = matchForwardHistory([point('2026-11-01',10,1,'2026-11-01'), point('2026-11-02',10,1,'2026-11-02'), point('2026-11-03',-10,1,'2026-11-03')], [bar('2026-11-01',100),bar('2026-11-02',200),bar('2026-11-03',100)], 'per');
    expect(forwardBandLevels(points)).toEqual([7.5,11.25,15,18.75,22.5]);
    expect(forwardBandLevels(points.slice(0,1))).toEqual([]);
  });
});
