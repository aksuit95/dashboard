import { PageHeader } from "@/components/PageHeader";
import { DisparityHelp } from "@/components/DisparityHelp";
import { loadDisparityIndicators } from "@/lib/sources/disparity-indicators";
import { FearGreedBoard } from "@/components/FearGreedBoard";
import { loadRiskCharts } from "@/lib/sources/risk-charts";
import { RangeChart } from "@/components/RangeChart";
import { formatPlain } from "@/lib/view/read";

export default async function RiskPage() {
  const [charts, disparity] = await Promise.all([loadRiskCharts(), loadDisparityIndicators()]);
  return (
    <div>
      <PageHeader
        title="위험 지표"
        description="이격도와 변동성, 반도체 지수 및 미국 국채 금리차의 흐름을 확인합니다."
      />
      <FearGreedBoard />
      <DisparityHelp />
      <div className="grid gap-4 lg:grid-cols-2">
        {disparity.map((item) => (
          <section key={item.id} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
            <h2 className="font-medium">{item.name}</h2>
            <p className="mt-1 text-xs text-zinc-500">{item.asOf ? `기준일 ${item.asOf} · ${item.basis}` : `데이터 없음 · ${item.basis}`}</p>
            {item.fetchedAt ? <p className="mt-1 text-xs text-zinc-500">수집 시각 {new Date(item.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</p> : null}
            {item.error ? <p role="status" className="mt-1 text-xs text-amber-300">종가 데이터를 불러오지 못했습니다.</p> : null}
            <p className="mt-1 text-sm text-zinc-400">25일 {formatPlain(item.latest25)} · 50일 {formatPlain(item.latest50)}</p>
            <div className="mt-3">
              <p className="mb-1 text-xs text-zinc-500">50일 이격도</p>
              <RangeChart points={item.series50} color="#38bdf8" />
            </div>
          </section>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {charts.map(item => <section key={item.id} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
          <h2 className="font-medium">{item.name}</h2>
          <p className="mt-1 text-xs text-zinc-500">{item.source}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatPlain(item.points.at(-1)?.value ?? null)}{item.points.length && item.id === "spread" ? "%p" : ""}</p>
          <p className="mt-1 text-xs text-zinc-500">{item.asOf ? `기준일 ${item.asOf} · ${item.basis}` : `데이터 없음 · ${item.basis}`}</p>
          {item.fetchedAt ? <p className="mt-1 text-xs text-zinc-500">수집 시각 {new Date(item.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</p> : null}
          {item.error ? <p role="status" className="mt-2 text-xs text-amber-300">{item.error}</p> : null}
          <div className="mt-3"><RangeChart points={item.points} color="#38bdf8" /></div>
        </section>)}
      </div>
    </div>
  );
}
