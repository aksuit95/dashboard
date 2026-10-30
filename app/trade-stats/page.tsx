import { ImportBox } from "@/components/ImportBox";
import { PageHeader } from "@/components/PageHeader";
import { RangeChart } from "@/components/RangeChart";
import { getDb } from "@/lib/db/client";
import { loadMonthly } from "@/lib/view/read";

export default function TradePage() {
  const series = loadMonthly(getDb(), "trade");
  return (
    <div>
      <PageHeader
        title="한국 무역 통계"
        description="관세청 월간 통계를 CSV 로 넣습니다. 1차는 DRAM, NAND 같은 관심 품목의 수출액과 단가입니다. 잠정과 확정은 label 로 구분합니다."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {series.map((item) => (
          <section key={item.key} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
            <h2 className="font-medium">{item.label}</h2>
            <p className="text-xs text-zinc-500">{item.key} · {item.unit}</p>
            <div className="mt-3">
              <RangeChart points={item.points.map((point) => ({ date: `${point.period}-01`, value: point.value }))} />
            </div>
          </section>
        ))}
      </div>
      {!series.length ? <p className="mb-4 text-sm text-zinc-500">무역 시계열이 없습니다.</p> : null}
      <div className="mt-6">
        <ImportBox
          kind="trade"
          hint="series_key, period, value, unit, label"
          sample={"series_key,period,value,unit,label\nDRAM,2026-09,16777,usd_million,DRAM 수출"}
        />
      </div>
    </div>
  );
}
