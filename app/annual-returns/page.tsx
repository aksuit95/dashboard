import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { formatPct, loadAnnual } from "@/lib/view/read";

export default function AnnualPage() {
  const series = loadAnnual(getDb());
  const years = [...new Set(series.flatMap((item) => item.rows.map((row) => row.year)))].sort();
  return (
    <div>
      <PageHeader
        title="주요 지수 연간 수익률"
        description="배당을 제외한 가격 지수입니다. 연간 수익률은 그해 마지막 종가를 직전 연도 마지막 종가로 나눈 값이고, 올해는 연초 대비가 아니라 전년 말 대비 YTD 입니다."
      />
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">지수</th>
              {years.map((year) => (
                <th key={year} className="px-3 py-2 text-right font-medium">{year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="px-3 py-2">{item.name}</td>
                {years.map((year) => {
                  const row = item.rows.find((entry) => entry.year === year);
                  const tone = row == null ? "text-zinc-600" : row.returnPct >= 0 ? "text-rose-300" : "text-sky-300";
                  return (
                    <td key={year} className={`px-3 py-2 text-right tabular-nums ${tone}`}>
                      {row ? `${formatPct(row.returnPct)}${row.ytd ? " YTD" : ""}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!years.length ? <p className="mt-4 text-sm text-zinc-500">일별 종가를 쌓으면 표가 채워집니다. npm run job:backfill</p> : null}
    </div>
  );
}
