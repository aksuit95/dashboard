import { ImportBox } from "@/components/ImportBox";
import { PageHeader } from "@/components/PageHeader";
import { RangeChart } from "@/components/RangeChart";
import { getDb } from "@/lib/db/client";
import { formatPct, formatPlain, loadAdr } from "@/lib/view/read";

export default function AdrPage() {
  const data = loadAdr(getDb());
  return (
    <div>
      <PageHeader
        title="등락비율 ADR"
        description="최근 20거래일 상승 종목 수 합을 하락 종목 수 합으로 나눈 값입니다. 보합은 넣지 않습니다. 120% 이상은 과열, 80% 이하는 과매도로 색만 구분합니다. 전 종목 등락 수는 공개 API가 없어 CSV로 넣습니다."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {data.markets.map((market) => {
          const tone = market.ratio == null ? "" : market.ratio >= 120 ? "text-rose-400" : market.ratio <= 80 ? "text-sky-400" : "text-zinc-100";
          return (
            <section key={market.market} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
              <h2 className="text-sm text-zinc-400">{market.market}</h2>
              <p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{formatPct(market.ratio)}</p>
              <p className="mt-1 text-sm text-zinc-400">전일 ADR 대비 {formatPlain(market.previous)}p · 상승 {market.up} · 하락 {market.down}</p>
              <div className="mt-4">
                <RangeChart points={market.series} />
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-6">
        <ImportBox
          kind="breadth"
          hint="market, date, advancers, decliners, unchanged"
          sample={"market,date,advancers,decliners,unchanged\nKOSPI,2026-10-28,400,500,30"}
        />
      </div>
    </div>
  );
}
