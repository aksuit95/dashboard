import type { StockHistory, StockHistoryPoint } from './stock-history';

type SectorDay = {asOf?: string; universe?: string; priceBasis?: string; rows?: {price?: number | null}[]};
export type SessionPublication = {snapshots?: {kospi200?: Record<string, SectorDay>; kosdaq150?: Record<string, SectorDay>}};
const validDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

/** Published sectors contain calendar-generated dates; require widespread observed closes on both markets. */
export function verifiedSessions(publication: SessionPublication): string[] {
  const snapshots = publication?.snapshots;
  const a = snapshots?.kospi200, b = snapshots?.kosdaq150;
  if (!a || !b) return [];
  const keys = Object.keys(a).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(b).sort())) return [];
  function actual(date: string, universe: string, day: SectorDay) {
    if (!validDate(date) || day?.asOf !== date || day.universe !== universe || day.priceBasis !== 'KRX_REGULAR_CLOSE' || !Array.isArray(day.rows) || day.rows.length < 100) return false;
    return day.rows.filter(row => typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0).length >= Math.ceil(day.rows.length * 0.5);
  }
  return keys.filter(date => actual(date, 'kospi200', a[date]) && actual(date, 'kosdaq150', b[date]));
}

export function resolveHistoryDates(history: StockHistory, publication: SessionPublication): StockHistory {
  const sessions = verifiedSessions(publication);
  const records: StockHistory['records'] = {};
  for (const [code, points] of Object.entries(history.records)) {
    records[code] = points.map(point => resolvePoint(point, sessions));
  }
  return {...history, records};
}

function resolvePoint(point: StockHistoryPoint, sessions: string[]): StockHistoryPoint {
  const result = {...point};
  const cpdIndex = point.cpdDate ? sessions.indexOf(point.cpdDate) : -1;
  for (const [sourceKey, targetKey] of [['epsSourceBaseDate', 'epsBaseDate'], ['bpsSourceBaseDate', 'bpsBaseDate']] as const) {
    const source = point[sourceKey];
    const stored = point[targetKey];
    // An explicit absolute source date is authoritative. Inferred dates are valid only for CPD-1TD.
    if (validDate(source)) result[targetKey] = source;
    else if (source === 'CPD-1TD' && validDate(point.cpdDate)) {
      if (cpdIndex > 0) result[targetKey] = sessions[cpdIndex - 1];
      else if (!(validDate(stored) && stored < point.cpdDate)) delete result[targetKey];
    } else delete result[targetKey];
  }
  return result;
}
