import { formatNumber, formatSigned } from "@/lib/format";
import type { MarketLiveSectorStock } from "@/lib/market/market-live";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const marketNames = { KOSPI: "코스피", KOSDAQ: "코스닥" } as const;

export function MarketLiveSectorToggle({ name, expanded, controls, onToggle }: {
  name: string; expanded: boolean; controls: string; onToggle: () => void;
}) {
  return (
    <button type="button" aria-expanded={expanded} aria-controls={expanded ? controls : undefined} onClick={event => {
      event.stopPropagation();
      onToggle();
    }}
      className="inline-flex items-baseline gap-1.5 rounded text-left font-medium text-emerald-200 hover:text-emerald-100 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-400">
      {name}<span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
    </button>
  );
}

export function MarketLiveSectorStocks({ id, name, stocks, priceLabel, status, selectedTime, showQuoteTime = false }: {
  id: string; name: string; stocks: MarketLiveSectorStock[]; priceLabel: string;
  status?: string; selectedTime?: string; showQuoteTime?: boolean;
}) {
  const ranked = [...stocks].sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity) || a.name.localeCompare(b.name, "ko"));
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#151a22]">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5 px-3 py-2">
        <h4 id={`${id}-title`} className="text-xs font-semibold">{name} 구성종목</h4>
        {selectedTime && <span className="text-xs tabular-nums text-zinc-400">{selectedTime}</span>}
      </div>
      {ranked.length ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-[#171d26] text-zinc-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">종목</th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">{priceLabel}</th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">등락률</th>
                {showQuoteTime && <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">시세 시각</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {ranked.map(stock => (
                <tr key={`${stock.market}:${stock.code}`}>
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    <span className="block font-medium text-zinc-100">{stock.name}</span>
                    <span className="text-[11px] text-zinc-400">{stock.name !== stock.code ? `${stock.code} · ` : ""}{marketNames[stock.market]}</span>
                  </th>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-zinc-200">{stock.price == null ? "—" : `${formatNumber(stock.price, 0)}원`}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 text-right font-medium ${stock.changePct == null || stock.changePct === 0 ? "text-zinc-300" : stock.changePct > 0 ? "text-rose-400" : "text-sky-400"}`}>
                    {stock.changePct == null ? "—" : `${formatSigned(Math.abs(stock.changePct) < 0.005 ? 0 : stock.changePct)}%`}
                  </td>
                  {showQuoteTime && <td className="whitespace-nowrap px-3 py-1.5 text-right text-zinc-400">{stock.asOf ? clock.format(Date.parse(stock.asOf)) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-3 pb-3 text-xs text-zinc-400" role="status">{status ?? "표시할 구성종목이 없습니다."}</p>}
    </section>
  );
}
