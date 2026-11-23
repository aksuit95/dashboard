import { krxCloseTime } from "@/config/market-calendar";
import { fetchKrxDailyCloses } from "./krx-daily-prices";
import { fetchNaverStockMinuteChart } from "./naver-market-live";

type Session = { date: string; openAt: number; closeAt: number };
type Quote = { price: number; fetchedAt: string };
const retryMs = 60_000;
const concurrency = 16;
type CloseCache = { quotes: Map<string, Quote>; retryAt: Map<string, number>; pending?: Promise<void> };
const cache = new Map<string, CloseCache>();

async function collectClose(code: string, session: Session, deadline: AbortSignal) {
  const { date, closeAt } = session;
  if (Date.now() < closeAt + 3 * 60_000) {
    // The daily field may still be settling immediately after the auction.
    const chart = await fetchNaverStockMinuteChart(code, { ...session, now: Date.now() }, deadline);
    const stamp = date.replaceAll("-", "") + krxCloseTime(date).replace(":", "") + "00";
    const quote = Array.isArray(chart.priceInfos) ? chart.priceInfos.find(row => row?.localDateTime === stamp) : undefined;
    return Number(quote?.currentPrice);
  }
  const fetcher: typeof fetch = (url, options) => fetch(url, { ...options, signal: AbortSignal.any([deadline, AbortSignal.timeout(6000)]) });
  const [row] = await fetchKrxDailyCloses(code, date, fetcher, 1);
  return row?.date === date ? row.close : null;
}

/** Only requested members missing from the exchange or the dated publication need another source. */
export async function loadMarketLiveRegularCloses(session: Session, codes: string[]): Promise<ReadonlyMap<string, Quote>> {
  if (!codes.length || Date.now() < session.closeAt) return new Map();
  const prior = cache.get(session.date);
  const entry: CloseCache = prior ?? { quotes: new Map(), retryAt: new Map() };
  if (!prior) {
    cache.set(session.date, entry);
    if (cache.size > 2) cache.delete(cache.keys().next().value!);
  }
  const { quotes, retryAt } = entry;
  if (entry.pending) await entry.pending;
  const now = Date.now();
  const missing = codes.filter(code => !quotes.has(code) && (retryAt.get(code) ?? 0) <= now);
  if (missing.length) {
    const deadline = AbortSignal.timeout(25_000);
    let offset = 0;
    entry.pending = Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
      while (!deadline.aborted && offset < missing.length) {
        const code = missing[offset++];
        try {
          const price = await collectClose(code, session, deadline);
          if (price != null && Number.isSafeInteger(price) && price > 0) {
            quotes.set(code, { price, fetchedAt: new Date().toISOString() });
          }
        } catch { /* An unconfirmed close stays missing until the next attempt. */ }
        if (!quotes.has(code)) retryAt.set(code, Date.now() + retryMs);
      }
    })).then(() => undefined).finally(() => { entry.pending = undefined; });
    await entry.pending;
  }
  return quotes;
}
