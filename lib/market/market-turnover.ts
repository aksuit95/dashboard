import { krxDate, krxNumber } from "@/lib/sources/investor-flow";

/** KRX MDCSTAT00301 market-index trading value, in won. */
export function parseMarketTurnover(payload: unknown, through: string) {
  const rows = (payload as { output?: Record<string, unknown>[] })?.output;
  if (!Array.isArray(rows) || !rows.length) throw new Error("KRX 시장 거래대금 데이터 없음");
  const points = rows.map(row => ({ date: krxDate(row.TRD_DD), value: krxNumber(row.ACC_TRDVAL) }))
    .filter(row => row.date <= through).sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length || points.at(-1)?.date !== through || points.some(p => p.value < 0) || new Set(points.map(p => p.date)).size !== points.length) throw new Error("KRX 거래대금 기준일·값 확인 실패");
  return points;
}
