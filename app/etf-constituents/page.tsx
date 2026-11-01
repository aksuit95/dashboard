import { ImportBox } from "@/components/ImportBox";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { formatPlain, loadHoldings } from "@/lib/view/read";

export default function HoldingsPage() {
  const data = loadHoldings(getDb());
  return (
    <div>
      <PageHeader title="ETF 비중 변화" description="국내 ETF 는 네이버가 주는 구성종목, 미국 ETF 는 Yahoo 상위 보유 종목입니다. 같은 ETF 의 스냅샷이 이틀 이상 있어야 차이를 계산하고, 그 전에는 수집 중으로 남깁니다." />
      {data.groups.map((group) => (
        <section key={group.id} className="mb-8">
          <h2 className="mb-3 text-sm text-zinc-400">{group.name}</h2>
          {group.funds.map((fund) => (
            <article key={fund.id} className="mb-4 rounded-xl border border-white/10 p-4">
              <h3 className="font-medium">{fund.name}</h3>
              <p className="text-xs text-zinc-500">{fund.status}</p>
              {fund.rows.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-1 text-left">종목</th>
                      <th className="py-1 text-right">이전</th>
                      <th className="py-1 text-right">현재</th>
                      <th className="py-1 text-right">차이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fund.rows.slice(0, 15).map((row) => (
                      <tr key={row.symbol} className="border-t border-white/10">
                        <td className="py-1">{row.name}</td>
                        <td className="py-1 text-right tabular-nums">{formatPlain(row.previous)}</td>
                        <td className="py-1 text-right tabular-nums">{formatPlain(row.current)}</td>
                        <td className={`py-1 text-right tabular-nums ${row.delta >= 0 ? "text-rose-300" : "text-sky-300"}`}>{formatPlain(row.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </article>
          ))}
        </section>
      ))}
      <ImportBox
        kind="holdings"
        hint="etf_symbol, as_of, constituent_symbol, constituent_name, weight_pct"
        sample={"etf_symbol,as_of,constituent_symbol,constituent_name,weight_pct\n091160.KS,2026-10-27,000660.KS,SK하이닉스,28.5\n091160.KS,2026-10-28,000660.KS,SK하이닉스,29.1"}
      />
    </div>
  );
}
