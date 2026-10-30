import { PageHeader } from "@/components/PageHeader";
import { RangeChart } from "@/components/RangeChart";
import { getDb } from "@/lib/db/client";
import { formatPlain, loadRatios } from "@/lib/view/read";

export default function RatioPage() {
  const cards = loadRatios(getDb());
  return (
    <div>
      <PageHeader
        title="상대 시가총액"
        description="통화가 다르면 그날 환율로 달러 시총을 맞춘 뒤 나눕니다. 우선주를 포함하는 쌍은 이름에 적어 두었습니다. 카드의 현재 비율은 최근 시세의 시총이고, 차트는 일별 시총이 있는 날만 그립니다."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <section key={card.id} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
            <h2 className="font-medium">{card.name}</h2>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{formatPlain(card.ratio)}%</p>
            <p className="mt-1 text-xs text-zinc-400">기준 {card.asOf ?? "없음"} · 고점 {formatPlain(card.high)} · 저점 {formatPlain(card.low)}</p>
            <p className="mt-2 text-xs text-zinc-500">{card.numerator} / {card.denominator}</p>
            {card.note ? <p className="mt-1 text-xs text-amber-200/80">{card.note}</p> : null}
            <div className="mt-3">
              <RangeChart points={card.series} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
