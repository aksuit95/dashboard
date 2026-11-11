import { minerviniSession } from "@/lib/market/minervini-session";

export type Holding = { code: string; name: string; quantity: number; weight: number };
export type FundMetrics = { asOf: string; sharesOutstanding: number | null; netAssetsKrw: number | null; source: "KRX_ETF_DAILY"; fetchedAt: string };
export type Snapshot = { fundMetrics?: FundMetrics; etfCode?: string; asOf: string; collectedAt: string; source: "KRX_PDF"; holdings: Holding[]; market: Record<string, { close: number; cap: number }> };
export type Publication = { version: 1 | 2; snapshots: Snapshot[]; lastAttempt: { at: string; expected: string; error: string | null } | null };
export const emptyPublication: Publication = { version: 1, snapshots: [], lastAttempt: null };
export function previousSession(date: string) { return minerviniSession(new Date(`${date}T06:00:00Z`)); }
function numeric(value: unknown) { const s = String(value ?? "").replaceAll(",", "").trim(); return s && /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN; }
export function parseKrxHoldings(payload: Record<string, unknown>): Holding[] {
  const rows = payload.output ?? payload.OutBlock_1 ?? payload.block1;
  if (!Array.isArray(rows) || !rows.length) throw new Error("KRX ETF 구성 응답이 비어 있습니다.");
  const result: Holding[] = [], seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") throw new Error("구성 행 형식 오류");
    const raw = String(row.COMPST_ISU_CD ?? "").trim();
    const code = /^KR7\d{6}\d{3}$/.test(raw) ? raw.slice(3, 9) : raw;
    const name = String(row.COMPST_ISU_NM ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      if (/현금|예금|원화|설정현금액|현금대용|미수|미지급/.test(name)) continue;
      throw new Error(`확인되지 않은 구성자산: ${name || raw}`);
    }
    const quantity = numeric(row.COMPST_ISU_CU1_SHRS), weight = numeric(row.COMPST_RTO);
    if (!name || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(weight) || weight < 0 || weight > 100 || seen.has(code)) throw new Error(`${code} 구성 수량 또는 비중 오류`);
    seen.add(code); result.push({ code, name, quantity, weight });
  }
  if (result.length < 5 || result.reduce((s, r) => s + r.weight, 0) > 101) throw new Error("KRX 구성종목 불완전");
  return result.sort((a, b) => b.weight - a.weight);
}
export function selectComparison(publication: Publication, expected: string, etfCode = "396500") {
  const latest = [...publication.snapshots].filter(s => (s.etfCode ?? "396500") === etfCode && s.asOf <= expected).sort((a,b) => b.asOf.localeCompare(a.asOf))[0] ?? null;
  const previous = latest ? publication.snapshots.find(s => (s.etfCode ?? "396500") === etfCode && s.asOf === previousSession(latest.asOf)) ?? null : null;
  return { latest, previous, stale: !!latest && latest.asOf !== expected };
}

export type Period = "1d" | "1w" | "1m" | "3m" | "6m";
export const periodOptions = [["1d", "1D · 전 거래일"], ["1w", "1W · 1주"], ["1m", "1M · 1개월"], ["3m", "3M · 3개월"], ["6m", "6M · 6개월"]] as const;
/** Calendar week/month anchor, adjusted back to the last KRX session on or before it. */
export function comparisonDate(date: string, period: Period): string {
  if (period === "1d") return previousSession(date);
  const d = new Date(`${date}T00:00:00Z`);
  if (period === "1w") d.setUTCDate(d.getUTCDate() - 7);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - ({"1m": 1, "3m": 3, "6m": 6} as const)[period]);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return minerviniSession(new Date(`${d.toISOString().slice(0, 10)}T08:00:00Z`));
}


