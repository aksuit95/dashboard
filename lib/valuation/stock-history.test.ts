import { describe, expect, it } from 'vitest';
import { addStockSnapshot, type StockHistory } from './stock-history';
import type { StockValuationData } from './stocks';

const data = (updated: string | null, eps: number): StockValuationData => ({fileName:'x', savedAt:'2026-11-11T00:00:00Z', sourceUpdatedAt:updated, compositionDate:'2026-11-11', metrics:[{id:'eps',itemCode:'E312060.M',sourceUnit:'Local/Shares',baseDate:'CPD-1TD'}], stocks:[{code:'005930',name:'삼성전자',values:{eps}}], warnings:[]});
const empty = (): StockHistory => ({schemaVersion:1, records:{}});
describe('stock snapshot history', () => {
  it('records the source query date rather than inventing an absolute CPD-1TD date', () => {
    const result = addStockSnapshot(empty(), data('2026-11-09 07:00:00', 5));
    expect(result.records['005930'][0]).toMatchObject({date:'2026-11-09',baseDate:'CPD-1TD',values:{eps:5}});
  });
  it('keeps the latest query for each date and ignores missing source dates', () => {
    let h = addStockSnapshot(empty(), data('2026-11-09 09:00:00', 6));
    h = addStockSnapshot(h, data('2026-11-09 07:00:00', 5));
    h = addStockSnapshot(h, data(null, 8));
    expect(h.records['005930']).toHaveLength(1);
    expect(h.records['005930'][0].values.eps).toBe(6);
  });
});
