export type FundMetrics = {
  asOf: string;
  sharesOutstanding: number | null;
  netAssetsKrw: number | null;
  source: "KRX_ETF_DAILY";
  fetchedAt: string;
};
type Row = Record<string, unknown>;
function positiveInteger(value: unknown): number | null {
  const text = String(value ?? "").replaceAll(",", "").trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
/** Exact-dated official ETF daily series; no market-cap or NAV-based estimates. */
export function parseKrxFundMetrics(payload: Record<string, unknown>, fetchedAt: string): Map<string, FundMetrics> {
  const rows = payload.output ?? payload.OutBlock_1;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("KRX ETF 일별 지표 응답 없음");
  if (!Number.isFinite(Date.parse(fetchedAt))) throw new Error("ETF 지표 수집시각 오류");
  const byDay = new Map<string, FundMetrics>();
  for (const row of rows as Row[]) {
    if (!row || typeof row !== "object") throw new Error("KRX ETF 일별 지표 행 오류");
    const day = String(row.TRD_DD ?? "").replaceAll("/", "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || byDay.has(day)) throw new Error("KRX ETF 일별 기준일 오류");
    byDay.set(day, { asOf: day, sharesOutstanding: positiveInteger(row.LIST_SHRS), netAssetsKrw: positiveInteger(row.INVSTASST_NETASST_TOTAMT), source: "KRX_ETF_DAILY", fetchedAt });
  }
  return byDay;
}
