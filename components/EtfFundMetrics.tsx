import { semiconductorEtfs } from "@/lib/etf/config";
import type { Period, Publication, Snapshot } from "@/lib/etf/holdings";
import { comparisonDate } from "@/lib/etf/holdings";

function amount(value: number | null | undefined) {
  if (value == null) return "—";
  const eok = value / 100_000_000;
  return eok >= 10_000 ? `${(eok / 10_000).toFixed(2)}조원` : `${Math.round(eok).toLocaleString("ko-KR")}억원`;
}
function count(value: number | null | undefined) { return value == null ? "—" : `${value.toLocaleString("ko-KR")}좌`; }
function metrics(snapshot: Snapshot | undefined, date: string | null) {
  const data = snapshot?.fundMetrics;
  return data && data.source === "KRX_ETF_DAILY" && data.asOf === date ? data : null;
}
export function EtfFundMetrics({ publication, expected, selected, period }: {publication: Publication; expected: string | null; selected: string; period: Period}) {
  let beforeDate: string | null = null;
  try { if (expected) beforeDate = comparisonDate(expected, period); } catch { /* unverified exchange calendar */ }
  const funds = selected === "common" ? semiconductorEtfs : semiconductorEtfs.filter(f => f.code === selected);
  return <section className="mb-5 rounded-2xl border border-white/10 bg-[#141a22] p-5 sm:p-6">
    <div><p className="text-xs font-bold tracking-[0.16em] text-emerald-400">ETF SIZE</p><h2 className="mt-2 text-xl font-bold">ETF 규모와 발행 좌수</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{beforeDate ?? "비교 기준일 미확인"} → {expected ?? "기준일 미확인"} · 선택 기간 기준</p></div>
    <div className="mt-4 divide-y divide-white/[0.07]">{funds.map(f => {
      const latest = publication.snapshots.find(s => (s.etfCode ?? "396500") === f.code && s.asOf === expected);
      const earlier = publication.snapshots.find(s => (s.etfCode ?? "396500") === f.code && s.asOf === beforeDate);
      const current = metrics(latest, expected), prior = metrics(earlier, beforeDate);
      const a = current?.sharesOutstanding, b = prior?.sharesOutstanding;
      const delta = a != null && b != null ? a - b : null;
      const pct = delta != null && b ? delta / b * 100 : null;
      return <div key={f.code} className="py-4 first:pt-2"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold">{f.name}</span><span className="text-xs text-zinc-500">{f.code}</span></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-white/[0.035] p-3"><p className="text-xs text-zinc-500">발행 좌수 · 상장 좌수</p><p className="mt-1 text-sm font-semibold tabular-nums">{count(a)}</p><p className="mt-1 text-xs text-zinc-400">{delta == null ? "비교 자료 없음" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("ko-KR")}좌 (${pct != null && pct > 0 ? "+" : ""}${pct == null ? "—" : `${pct.toFixed(2)}%`})`}</p></div><div className="rounded-lg bg-white/[0.035] p-3"><p className="text-xs text-zinc-500">순자산총액</p><p className="mt-1 text-sm font-semibold tabular-nums">{amount(current?.netAssetsKrw)}</p><p className="mt-1 text-xs text-zinc-400">비교 기준일 {amount(prior?.netAssetsKrw)}</p></div></div></div>;
    })}</div>
    <p className="mt-3 text-xs leading-5 text-zinc-500">자료: KRX ETF 일별 통계. 발행 좌수 증감은 설정·환매를 살피는 참고 지표이며 결제 시차가 있을 수 있습니다. 순자산총액에는 자산 가격 변동과 설정·환매가 함께 반영되므로 순유입액이 아닙니다. 기준일 자료가 없으면 결측으로 표시합니다.</p>
  </section>;
}
