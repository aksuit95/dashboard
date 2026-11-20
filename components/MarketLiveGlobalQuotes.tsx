"use client";

import { useEffect, useState } from "react";
import { marketLiveGlobalQuotes, marketLiveGlobalRefreshMs } from "@/config/market-live-global";
import { formatSigned, formatWhen } from "@/lib/format";
import type { MarketCard } from "@/lib/sources/futures-board";

const sessionLabels: Record<MarketCard["session"], string> = {
  live: "최근 시세", open: "장중", break: "점심휴장", pre: "장전",
  unknown: "거래 상태 미확인", closed: "장마감", missing: "시세 미확인",
};

export function MarketLiveGlobalQuotes() {
  const [quotes, setQuotes] = useState<MarketCard[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function refresh() {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const response = await fetch("/api/futures/board?view=market-live", { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && !controller.signal.aborted) setQuotes(data);
        }
      } catch { /* Keep the last quoted values and their original timestamps. */ }
      finally { loading = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, marketLiveGlobalRefreshMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <ul aria-label="아시아 증시와 미국 선물 등락률" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/10 bg-[#151a22] px-4 py-2.5 text-xs">
      {marketLiveGlobalQuotes.map(({ id, label }) => {
        const quote = quotes.find(item => item.id === id);
        const change = quote?.changePct;
        const detail = quote
          ? [quote.venue, sessionLabels[quote.session], quote.tradedAt && `${formatWhen(quote.tradedAt)} KST`, quote.delayed && "시세 지연"].filter(Boolean).join(" · ")
          : "시세 미확인";
        return (
          <li key={id} title={detail} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="font-medium text-zinc-200">{label}</span>
            <span className={`font-semibold tabular-nums ${change == null || change === 0 ? "text-zinc-400" : change > 0 ? "text-rose-400" : "text-sky-400"}`}>
              {change == null ? "—" : `${formatSigned(change)}%`}
            </span>
            <span className="sr-only"> {detail}</span>
          </li>
        );
      })}
    </ul>
  );
}
