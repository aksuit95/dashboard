import { ImportBox } from "@/components/ImportBox";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { formatPlain, loadTaiwanSectors } from "@/lib/view/read";

export default function TaiwanPage() {
  const sectors = loadTaiwanSectors(getDb());
  return (
    <div>
      <PageHeader
        title="대만 월매출"
        description="MOPS 월매출을 CSV 로 넣습니다. 섹터 YoY 는 종목별 YoY 의 평균이 아니라, 전년 동월 값이 있는 종목의 매출 합으로 계산합니다."
      />
      {sectors.map((sector) => (
        <section key={sector.sector} className="mb-6">
          <h2 className="font-medium">{sector.sector} <span className="text-sm text-zinc-400">YoY {formatPlain(sector.yoy)}%</span></h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 text-left">종목</th>
                <th className="py-1 text-right">최근</th>
                <th className="py-1 text-right">MoM</th>
                <th className="py-1 text-right">YoY</th>
              </tr>
            </thead>
            <tbody>
              {sector.names.map((name) => (
                <tr key={name.symbol} className="border-t border-white/10">
                  <td className="py-1">{name.name} <span className="text-zinc-500">{name.symbol}</span></td>
                  <td className="py-1 text-right tabular-nums">{formatPlain(name.latest, 0)}</td>
                  <td className="py-1 text-right tabular-nums">{formatPlain(name.mom)}%</td>
                  <td className="py-1 text-right tabular-nums">{formatPlain(name.yoy)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!sectors.length ? <p className="mb-4 text-sm text-zinc-500">월매출이 없습니다.</p> : null}
      <ImportBox
        kind="taiwan"
        hint="sector, symbol, name, period, revenue"
        sample={"sector,symbol,name,period,revenue\nFoundry,2330,TSMC,2025-09,300000\nFoundry,2330,TSMC,2026-09,450000"}
      />
    </div>
  );
}
