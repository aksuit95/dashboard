import type { StockValuationData, StockMetric } from './stocks';

export type StockHistoryPoint = { date: string; sourceUpdatedAt: string; values: Partial<Record<StockMetric, number | null>>; baseDate: string; cpdDate?: string; epsSourceBaseDate?: string; bpsSourceBaseDate?: string; epsBaseDate?: string; bpsBaseDate?: string };
export type StockHistory = { schemaVersion: 1; records: Record<string, StockHistoryPoint[]> };

/** Record only the original query date. CPD-1TD is a relative date, not an absolute verified close date. */
export function addStockSnapshot(history: StockHistory, data: StockValuationData): StockHistory {
  const updated = data.sourceUpdatedAt;
  if (!updated || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(updated)) return history;
  const date = updated.slice(0, 10);
  const records = { ...history.records };
  for (const stock of data.stocks) {
    const old = records[stock.code] ?? [];
    const point: StockHistoryPoint = { date, sourceUpdatedAt: updated, values: stock.values, baseDate: data.metrics[0]?.baseDate ?? '', cpdDate: data.compositionDate, epsSourceBaseDate: data.metrics.find(m => m.id === 'eps')?.baseDate, bpsSourceBaseDate: data.metrics.find(m => m.id === 'bps')?.baseDate };
    for (const [id, key] of [['eps', 'epsBaseDate'], ['bps', 'bpsBaseDate']] as const) {
      const value = data.metrics.find(m => m.id === id)?.baseDate;
      if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) point[key] = value;
    }
    const sameDay = old.find(p => p.date === date);
    if (sameDay && sameDay.sourceUpdatedAt > updated) continue;
    if (sameDay && sameDay.sourceUpdatedAt === updated && sameDay.cpdDate === point.cpdDate) {
      if (sameDay.epsSourceBaseDate === point.epsSourceBaseDate && sameDay.epsBaseDate) point.epsBaseDate = sameDay.epsBaseDate;
      if (sameDay.bpsSourceBaseDate === point.bpsSourceBaseDate && sameDay.bpsBaseDate) point.bpsBaseDate = sameDay.bpsBaseDate;
    }
    records[stock.code] = [...old.filter(p => p.date !== date), point].sort((a,b) => a.date.localeCompare(b.date));
  }
  return { schemaVersion: 1, records };
}
