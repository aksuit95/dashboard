import { unstable_cache } from "next/cache";
import { activeInstruments } from "@/config/universe";
import type { AppDatabase } from "@/lib/db/client";
import { applyQuote, syncInstruments } from "@/lib/db/quotes";
import { parseYahooChartQuote, usCashSession } from "@/lib/sources/futures-board";
import { loadRisk } from "@/lib/view/read";

const symbols = ["^VIX", "^SOX", "^TNX", "2YY=F"];
type Chart = {
  meta?: { gmtoffset?: number };
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[] };
};

// Cache successful source responses across Vercel instances, rather than relying on /tmp.
const chart = unstable_cache(async (symbol: string) => {
  const range = "5d";
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`, {
    cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0] as Chart | undefined;
  const quote = parseYahooChartQuote(payload);
  if (!result || !quote) throw new Error(`${symbol}: 시세 응답이 비어 있습니다.`);
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const bars = (result.timestamp ?? []).flatMap((stamp, index) => {
    const close = closes[index];
    if (close == null || !Number.isFinite(close) || close <= 0) return [];
    return [{ date: new Date((stamp + (result.meta?.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10), close }];
  });
  return { quote, bars };
}, ["risk-indicator-chart-v1"], { revalidate: 60 });

export async function loadRiskIndicators(db: AppDatabase, now = new Date()) {
  syncInstruments(db, activeInstruments().filter(item => symbols.includes(item.id)));
  const results = await Promise.allSettled(symbols.map(async symbol => {
    const result = await chart(symbol);
    const quote = result.quote;
    applyQuote(db, symbol, { status: "ok", data: {
      price: quote.price,
      previousClose: quote.change == null ? null : quote.price - quote.change,
      asOf: quote.tradedAtMs == null ? null : new Date(quote.tradedAtMs).toISOString(),
      session: usCashSession(now), fundingHourly: null,
      sharesOutstanding: null, marketCap: null, marketCapCurrency: null, nav: null,
    } }, now.toISOString());
  }));
  const errors = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    applyQuote(db, symbols[index], { status: "stale", message: "시세 수집 실패" }, now.toISOString());
    return [`${symbols[index]} 데이터를 가져오지 못했습니다. 잠시 후 페이지를 다시 열어 주세요.`];
  });
  return { ...loadRisk(db), errors };
}
