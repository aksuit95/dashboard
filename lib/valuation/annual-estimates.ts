export type AnnualPoint = { date: string; observedAt: string; fiscalPeriod: string | null; eps: number | null; bps: number | null; close: number | null };
export type AnnualHistory = { schemaVersion: 1; source: 'Naver Finance annual consensus'; priceBasis: 'KRX_REGULAR_CLOSE'; records: Record<string, AnnualPoint[]> };

function value(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^-?\d[\d,]*(?:\.\d+)?$/.test(raw.trim())) return null;
  const n = Number(raw.replaceAll(',', ''));
  return Number.isFinite(n) ? n : null;
}
/** First forecast period ending after the observed date; EPS and BPS must share that period. */
export function parseAnnualEstimate(payload: unknown, code: string, date: string): { fiscalPeriod: string | null; eps: number | null; bps: number | null } {
  const p = payload as { itemCode?: string; financePeriodType?: string; financeInfo?: { trTitleList?: { isConsensus?: string; key?: string }[]; rowList?: { title?: string; columns?: Record<string, {value?: unknown}> }[] } };
  if (p?.itemCode !== code || p.financePeriodType !== 'annual' || !Array.isArray(p.financeInfo?.trTitleList) || !Array.isArray(p.financeInfo.rowList)) throw new Error('예상 재무 응답 형식 오류');
  const period = p.financeInfo.trTitleList.filter(x => x.isConsensus === 'Y' && /^\d{4}(0[1-9]|1[0-2])$/.test(x.key ?? '') && x.key! >= date.slice(0, 7).replace('-', '')).map(x => x.key!).sort()[0];
  if (!period) return { fiscalPeriod: null, eps: null, bps: null };
  const get = (title: string) => value(p.financeInfo!.rowList!.find(x => x.title === title)?.columns?.[period]?.value);
  return { fiscalPeriod: `${period.slice(0,4)}-${period.slice(4)}`, eps: get('EPS'), bps: get('BPS') };
}
