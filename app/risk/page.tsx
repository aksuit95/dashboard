import { PageHeader } from "@/components/PageHeader";
import { QuoteCard } from "@/components/QuoteCard";
import { RangeChart } from "@/components/RangeChart";
import { getDb } from "@/lib/db/client";
import { formatPlain, loadRisk } from "@/lib/view/read";

export default function RiskPage() {
  const data = loadRisk(getDb());
  return (
    <div>
      <PageHeader
        title="위험 지표"
        description="이격도 = 종가 / N일 이동평균 × 100. 금리차는 10년물에서 2년 금리 선물을 뺀 값입니다. Fear & Greed 와 VKOSPI 는 안정적인 공개 출처가 없어 연결하지 않았습니다."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {data.disparity.map((item) => (
          <section key={item.id} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
            <h2 className="font-medium">{item.name}</h2>
            <p className="mt-1 text-sm text-zinc-400">25일 {formatPlain(item.latest25)} · 50일 {formatPlain(item.latest50)}</p>
            <div className="mt-3">
              <p className="mb-1 text-xs text-zinc-500">50일 이격도</p>
              <RangeChart points={item.series50} color="#38bdf8" />
            </div>
          </section>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {data.vix ? <QuoteCard card={data.vix} /> : null}
        <section className="rounded-xl border border-white/10 bg-[#151a22] p-4">
          <h2 className="font-medium">금리차</h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{formatPlain(data.spread?.value ?? null)}%p</p>
          <p className="mt-2 text-sm text-zinc-400">
            10년 {formatPlain(data.spread?.ten ?? null)} · 2년 선물 {formatPlain(data.spread?.two ?? null)}
          </p>
          <p className="mt-2 text-xs text-zinc-500">{data.spread?.note}</p>
        </section>
      </div>
    </div>
  );
}
