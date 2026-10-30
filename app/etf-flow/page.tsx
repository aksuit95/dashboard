import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { formatFlow, loadEtfFlows } from "@/lib/view/read";
import { formatCompact } from "@/lib/format";

export default function EtfFlowPage() {
  const groups = loadEtfFlows(getDb());
  return (
    <div>
      <PageHeader
        title="ETF 유출입"
        description="일간 순유출입 = (당일 상장좌수 − 전일 상장좌수) × 당일 NAV. NAV 가 없는 날은 계산하지 않습니다. 좌수 스냅샷이 이틀 쌓이기 전에는 값이 비어 있습니다."
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
                  {formatFlow(card.flow, card.currency)}
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  좌수 {card.shares == null ? "—" : card.shares.toLocaleString("ko-KR")} · AUM {card.aum == null ? "—" : formatCompact(card.aum, card.currency)}
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
