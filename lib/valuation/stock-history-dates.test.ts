import { describe, expect, it } from 'vitest';
import { resolveHistoryDates, verifiedSessions, type SessionPublication } from './stock-history-dates';
import type { StockHistoryPoint } from './stock-history';

const day = (date: string, universe: string, closes = 100) => ({ asOf:date, universe, priceBasis:'KRX_REGULAR_CLOSE', rows:Array.from({length:100},(_,i)=>({price:i < closes ? 100 : null})) });
const publication: SessionPublication = {snapshots:{
  kospi200:{'2026-11-05':day('2026-11-05','kospi200'), '2026-11-06':day('2026-11-06','kospi200'), '2026-11-09':day('2026-11-09','kospi200'), '2026-11-10':day('2026-11-10','kospi200',0)},
  kosdaq150:{'2026-11-05':day('2026-11-05','kosdaq150'), '2026-11-06':day('2026-11-06','kosdaq150'), '2026-11-09':day('2026-11-09','kosdaq150'), '2026-11-10':day('2026-11-10','kosdaq150',0)},
}};
const point: StockHistoryPoint = {date:'2026-11-09',sourceUpdatedAt:'2026-11-09 12:00:00',values:{eps:10,bps:20},baseDate:'CPD-1TD',cpdDate:'2026-11-09',epsSourceBaseDate:'CPD-1TD',bpsSourceBaseDate:'CPD-1TD'};
describe('resolve source estimate dates',()=>{
  it('requires real closes in both universes and resolves the prior market session across weekends',()=>{
    expect(verifiedSessions(publication)).toEqual(['2026-11-05','2026-11-06','2026-11-09']);
    const resolved = resolveHistoryDates({schemaVersion:1, records:{'005930':[point]}},publication).records['005930'][0];
    expect(resolved.epsBaseDate).toBe('2026-11-06'); expect(resolved.bpsBaseDate).toBe('2026-11-06');
  });
  it('never guesses missing CPD dates or unverified relative expressions, and honors explicit dates',()=>{
    const missing = {...point,cpdDate:'2026-11-11',epsSourceBaseDate:'CPD-1TD',bpsSourceBaseDate:'2026-11-04'};
    const p = resolveHistoryDates({schemaVersion:1, records:{'005930':[missing]}},publication).records['005930'][0];
    expect(p.epsBaseDate).toBeUndefined(); expect(p.bpsBaseDate).toBe('2026-11-04');
    const p2 = resolveHistoryDates({schemaVersion:1, records:{'005930':[{...point,epsSourceBaseDate:'unknown',epsBaseDate:'2026-11-06'}]}},publication).records['005930'][0];
    expect(p2.epsBaseDate).toBeUndefined();
  });
  it('keeps previously resolved dates after the publication window has moved',()=>{
    const p = resolveHistoryDates({schemaVersion:1,records:{'005930':[{...point,epsBaseDate:'2026-11-06'}]}},{}).records['005930'][0];
    expect(p.epsBaseDate).toBe('2026-11-06');
  });
});
