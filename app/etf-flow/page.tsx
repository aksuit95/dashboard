import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { formatFlow, loadEtfFlows } from "@/lib/view/read";
import { formatCompact, formatPrice } from "@/lib/format";

export default function EtfFlowPage() {
  const groups = loadEtfFlows(getDb());
  return (
    <div>
      <PageHeader
        title="ETF 유출입"
        description="일간 순유출입 = (당일 상장좌수 − 전일 상장좌수) × 당일 NAV. NAV 가 없으면 계산하지 않고, 시장 가격으로 대신하지 않습니다. 국내 ETF 좌수는 순자산총액 ÷ NAV 입니다. 전일 좌수가 없으면 유출입을 비웁니다."
      />
      {groups.map((group) => (
        <section key={group.id} className="mb-6">
          <h2 className="mb-3 text-sm text-zinc-400">{group.name}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {group.cards.map((card) => (
              <article key={card.id} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
                <h3 className="font-medium">{card.name}</h3>
                <p className="text-xs text-zinc-500">{card.symbol} · {card.asOf ?? "기준일 없음"}</p>
                <p className={`mt-3 text-2xl tabular-nums ${card.flow == null ? "text-zinc-400" : card.flow >= 0 ? "text-rose-300" : "text-sky-300"}`}>
                  {card.flow == null ? (card.nav == null ? "NAV 없음" : "좌수 이틀 필요") : formatFlow(card.flow, card.currency)}
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  좌수 {card.shares == null ? "—" : Math.round(card.shares).toLocaleString("ko-KR")} · NAV {card.nav == null ? "—" : formatPrice(card.nav, card.currency)} · AUM {card.aum == null ? "—" : formatCompact(card.aum, card.currency)}
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
