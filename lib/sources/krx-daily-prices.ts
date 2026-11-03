import type { MinerviniBar } from "@/lib/market/minervini";

export type KrxDailyClose = { date: string; close: number | null };
type KrxDailyRows = { closes: KrxDailyClose[]; items: Map<string, Record<string, unknown>> };

async function requestPage(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetchImpl(url, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`KRX 일별 시세 HTTP ${response.status}`);
      return await response.json();
    } catch (error) { if (attempt >= 1) throw error; }
  }
}

/** The legacy chart feed's close can include NXT. Never fall back to closingPrice. */
export function parseKrxDailyPage(payload: unknown, through: string): { bars: KrxDailyClose[]; hasNext: boolean; dates: string[] } {
  const data = payload as { items?: Record<string, unknown>[]; hasNext?: boolean };
  if (!Array.isArray(data?.items) || typeof data.hasNext !== "boolean" || (data.hasNext && data.items.length !== 100)) throw new Error("KRX 일별 시세 페이지 형식 오류");
  const bars: KrxDailyClose[] = [];
  const dates: string[] = [];
  for (const item of data.items) {
    const date = item.tradingDateKst;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("KRX 일별 시세 날짜 오류");
    if (dates.length && dates.at(-1)! <= date) throw new Error("KRX 일별 시세 날짜 중복·순서 오류");
    dates.push(date);
    if (date > through) continue;
    const raw = item.regularMarketClosingPrice;
    const close = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    // Newly listed shares can include an all-zero placeholder before first trading.
    // Keep its position as missing so a return window never shifts to another date.
    if (close === 0 && item.closingPrice != null && Number(item.closingPrice) === 0 && item.tradingVolume != null && Number(item.tradingVolume) === 0) {
      bars.push({ date, close: null });
      continue;
    }
    if (!Number.isFinite(close) || close <= 0) throw new Error(`${date} KRX 정규장 종가 없음`);
    bars.push({ date, close });
  }
  return { bars, hasNext: data.hasNext, dates };
}

async function fetchKrxDailyRows(code: string, through: string, fetchImpl: typeof fetch, count: number): Promise<KrxDailyRows> {
  if (!Number.isInteger(count) || count < 1 || count > 1500) throw new Error("KRX 일봉 조회 개수 오류");
  const bars: KrxDailyClose[] = [];
  const items = new Map<string, Record<string, unknown>>();
  let previousDate: string | undefined;
  for (let index = 0; index < Math.ceil(count / 100) + 1; index++) {
    let page: ReturnType<typeof parseKrxDailyPage>;
    try {
      const payload = await requestPage(`https://stock.naver.com/api/stockSecurity/items/v2/domestic/${code}/daily-prices/paged?size=100&index=${index}`, fetchImpl);
      page = parseKrxDailyPage(payload, through);
      for (const item of (payload as { items: Record<string, unknown>[] }).items) items.set(String(item.tradingDateKst), item);
    }
    catch (error) { throw new Error(`${code} ${(error as Error).message}`); }
    if (previousDate && page.dates[0] && previousDate <= page.dates[0]) throw new Error(`${code} KRX 일별 시세 페이지 중복·순서 오류`);
    previousDate = page.dates.at(-1);
    bars.push(...page.bars);
    if (!page.hasNext || bars.length >= count) break;
  }
  const sorted = bars.sort((a, b) => a.date.localeCompare(b.date)).slice(-count);
  if (sorted.at(-1)?.date !== through) throw new Error(`${code} ${through} KRX 종가 미반영`);
  if (sorted.at(-1)?.close == null) throw new Error(`${code} ${through} KRX 정규장 종가 없음`);
  return { closes: sorted, items };
}

export async function fetchKrxDailyCloses(code: string, through: string, fetchImpl: typeof fetch = fetch, count = 253): Promise<KrxDailyClose[]> {
  return (await fetchKrxDailyRows(code, through, fetchImpl, count)).closes;
}

const numeric = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;

/** KRX daily OHLCV, with the explicit 15:30 close rather than the later closingPrice. */
export async function fetchKrxDailyBars(code: string, through: string, fetchImpl: typeof fetch = fetch, count = 360): Promise<MinerviniBar[]> {
  const { closes, items } = await fetchKrxDailyRows(code, through, fetchImpl, count);
  const bars: MinerviniBar[] = [];
  for (const { date, close } of closes) {
    if (close == null) {
      if (bars.length) throw new Error(`${code} ${date} KRX 일봉 중간 결측`);
      continue; // An all-zero placeholder before first listing is not an actual bar.
    }
    const item = items.get(date)!;
    let open = numeric(item.openingPrice), high = numeric(item.highPrice), low = numeric(item.lowPrice);
    const volume = numeric(item.tradingVolume);
    if (![open, high, low, volume].every(Number.isFinite) || volume < 0) throw new Error(`${code} ${date} KRX OHLCV 값 오류`);
    if (volume === 0 && open === 0 && high === 0 && low === 0) open = high = low = close;
    if (open <= 0 || low <= 0 || high < Math.max(open, close) || low > Math.min(open, close)) throw new Error(`${code} ${date} KRX 일봉 고저가 오류`);
    bars.push({ date, open, high, low, close, volume });
  }
  return bars;
}
