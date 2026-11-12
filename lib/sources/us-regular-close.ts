import { US_EARLY_CLOSE } from "@/config/market-calendar";
import { localDate, zonedTime } from "@/lib/market/market-hours";
import type { CloseBar } from "@/lib/market/adr-premium";

/** Accept only the requested completed US regular session, never pre/post-market prices. */
export function parseUsRegularClose(payload: unknown, symbol: string, date: string, now: Date): CloseBar | null {
  const meta = (payload as { chart?: { result?: { meta?: {
    symbol?: string; currency?: string; exchangeTimezoneName?: string;
    regularMarketPrice?: number; regularMarketTime?: number;
    currentTradingPeriod?: { regular?: { start?: number; end?: number } };
  } }[] } })?.chart?.result?.[0]?.meta;
  const period = meta?.currentTradingPeriod?.regular;
  const start = zonedTime(date, 570, "America/New_York");
  const end = zonedTime(date, US_EARLY_CLOSE.has(date) ? 780 : 960, "America/New_York");
  const time = (meta?.regularMarketTime ?? NaN) * 1000;
  if (meta?.symbol !== symbol || meta.currency !== "USD" || meta.exchangeTimezoneName !== "America/New_York"
    || !Number.isFinite(meta.regularMarketPrice) || !(meta.regularMarketPrice! > 0)
    || (period?.start ?? NaN) * 1000 !== start || (period?.end ?? NaN) * 1000 !== end
    || end > now.getTime() || !Number.isFinite(time) || time < start || time > end
    || localDate(time, "America/New_York") !== date) return null;
  return { date, close: meta.regularMarketPrice! };
}

export async function fetchUsRegularClose(symbol: string, date: string, now: Date): Promise<CloseBar | null> {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
    cache: "no-store", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`미국 정규장 종가 응답 ${response.status}`);
  return parseUsRegularClose(await response.json(), symbol, date, now);
}
