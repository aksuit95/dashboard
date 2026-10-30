import type { CardModel } from "@/lib/view/read";
import { formatWhen } from "@/lib/format";

export function QuoteCard({ card }: { card: CardModel }) {
  const tone = card.changePct == null ? "text-zinc-300" : card.changePct > 0 ? "text-rose-400" : card.changePct < 0 ? "text-sky-400" : "text-zinc-300";
  const session =
    card.session === "live" ? "Live" : card.session === "closed" ? "Closed" : card.session === "unknown" ? "Unknown" : "없음";
  return (
    <article className="rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{card.name}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {card.symbol} · {card.venue}
          </p>
        </div>
        <span className={`text-[11px] ${card.session === "live" ? "text-emerald-400" : "text-zinc-500"}`}>{session}</span>
      </div>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${tone}`}>{card.primary}</p>
      <p className={`mt-1 text-sm tabular-nums ${tone}`}>{card.changeText}</p>
      {card.stale ? <p className="mt-2 text-xs text-amber-300">지연 데이터</p> : null}
      <ul className="mt-3 space-y-1 text-xs text-zinc-400">
        {card.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {card.asOf ? <li>기준 {formatWhen(card.asOf)}</li> : null}
      </ul>
    </article>
  );
}
