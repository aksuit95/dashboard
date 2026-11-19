import { krxCloseTime } from "@/config/market-calendar";

const NAVER_MARKET_API = "https://stock.naver.com/api/securityService";
const STOCK_BATCH_SIZE = 100;

type IndexSymbol = "KOSPI" | "KOSDAQ";
type IndexPoint = { time: string; value: number };
type IndexBreadth = { advancers: number; decliners: number; unchanged: number };
type StockQuote = { code: string; price: number; turnover: number; asOf: string };
type Session = { date: string; openAt: number; closeAt: number; now: number };
type IndexChart = {
  points: IndexPoint[];
  previousClose: number | null;
  previousDate: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonNegative(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function positive(value: unknown): number | null {
  const number = nonNegative(value);
  return number !== null && number > 0 ? number : null;
}

function compactDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === iso ? iso : null;
}

function compactTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{14}$/.test(value)) return null;
  const date = compactDate(value.slice(0, 8));
  return date && `${date}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`;
}

function sessionTime(value: unknown, session: Session): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?\+09:00$/.test(value) || value.slice(0, 10) !== session.date) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < session.openAt || time > Math.min(session.closeAt, session.now)) return null;
  return value;
}

class NaverMarketHttpError extends Error {
  constructor(readonly status: number) {
    super(`네이버 장중 시세 HTTP ${status}`);
  }
}

export function isRetryableNaverStockMinuteError(error: unknown) {
  if (error instanceof NaverMarketHttpError) return error.status === 408 || error.status >= 500;
  return error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");
}

async function readJson(path: string, fetcher: typeof fetch, batchSignal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(6000);
  const response = await fetcher(`${NAVER_MARKET_API}${path}`, {
    cache: "no-store",
    signal: batchSignal ? AbortSignal.any([timeout, batchSignal]) : timeout,
    headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
  });
  if (!response.ok) throw new NaverMarketHttpError(response.status);
  return response.json();
}

export async function fetchNaverStockMinuteChart(code: string, session: Session, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const chart = record(await readJson(`/chart/domestic/item/${code}?periodType=day`, fetcher, signal));
  if (chart.code !== code || chart.stockExchangeType !== "KRX" || chart.infoType !== "item" ||
      chart.periodType !== "day" || compactDate(chart.tradeBaseAt) !== session.date || !Array.isArray(chart.priceInfos)) {
    throw new Error("네이버 KRX 종목 분봉 기준 불일치");
  }
  return chart;
}

export function parseNaverStockMinutes(chart: Record<string, unknown>, session: Session) {
  const points = new Map<number, number>();
  if (!Array.isArray(chart.priceInfos)) return points;
  const day = session.date.replaceAll("-", "");
  const midnight = Date.parse(`${session.date}T00:00:00+09:00`);
  const latest = Math.min(session.closeAt, session.now);
  for (const item of chart.priceInfos) {
    const row = record(item);
    const stamp = row.localDateTime;
    if (typeof stamp !== "string" || !stamp.startsWith(day) || !/^(?:[01]\d|2[0-3])[0-5]\d00$/.test(stamp.slice(8))) continue;
    const at = midnight + (+stamp.slice(8, 10) * 60 + +stamp.slice(10, 12)) * 60_000;
    // The feed uses minute-start labels and can include off-session rows.
    if (at < session.openAt || at > latest || (at < session.closeAt && at + 60_000 > session.now)) continue;
    const price = positive(row.currentPrice);
    if (price !== null) points.set(at, price);
  }
  return points;
}

export function naverStockPreviousKrxClose(chart: Record<string, unknown>, baselineDate: string) {
  if (compactDate(chart.lastTradeBaseAt) !== baselineDate || !Array.isArray(chart.lastPriceInfos)) return null;
  const stamp = baselineDate.replaceAll("-", "") + krxCloseTime(baselineDate).replace(":", "") + "00";
  const atClose = positive(record(chart.lastPriceInfos.find(item => record(item).localDateTime === stamp)).currentPrice);
  // The previous series can continue to 20:00; require the regular close bar and its reference price to agree.
  return atClose !== null && atClose === positive(chart.lastClosePrice) ? atClose : null;
}

async function stockBatch(codes: string[], session: Session, fetcher: typeof fetch): Promise<StockQuote[]> {
  const body = record(await readJson(`/integration/price?domesticKrxCodes=${codes.join(",")}`, fetcher));
  const krx = record(body.domesticKrx);
  if (!Object.keys(krx).length) throw new Error("네이버 KRX 장중 종목 응답 없음");
  const quotes: StockQuote[] = [];
  for (const code of codes) {
    const row = record(krx[code]);
    if (row.itemCode !== code || row.stockEndType !== "stock" || row.tradableStatus !== "tradable" ||
        (row.stockExchangeType !== "KOSPI" && row.stockExchangeType !== "KOSDAQ") || row.currencyType !== "KRW") continue;
    // The explicitly selected KRX group also carries an NXT quote inside overMarketPriceInfo.
    const price = positive(row.currentPrice);
    const turnover = nonNegative(row.accumulatedTradingValue);
    const asOf = sessionTime(row.localTradedAt, session);
    if (price !== null && turnover !== null && asOf) quotes.push({ code, price, turnover, asOf });
  }
  return quotes;
}

export async function fetchNaverLiveStocks(codes: string[], date: string, openAt: number, closeAt: number, now: number, fetcher: typeof fetch = fetch) {
  const unique = [...new Set(codes.filter(code => /^[A-Z0-9]{6}$/.test(code)))];
  const session = { date, openAt, closeAt, now };
  const requests = [];
  for (let i = 0; i < unique.length; i += STOCK_BATCH_SIZE) {
    requests.push(stockBatch(unique.slice(i, i + STOCK_BATCH_SIZE), session, fetcher));
  }
  const batches = await Promise.allSettled(requests);
  const quotes = batches.flatMap(batch => batch.status === "fulfilled" ? batch.value : []);
  const failedBatches = batches.filter(batch => batch.status === "rejected").length;
  return { quotes, failedBatches };
}

function parseBreadth(value: unknown): IndexBreadth | null {
  const row = record(value);
  if (row.exchangeType !== "KRX") return null;
  const advancers = nonNegative(row.risingCount);
  const decliners = nonNegative(row.fallingCount);
  const unchanged = nonNegative(row.unchangedCount);
  if (advancers === null || decliners === null || unchanged === null || ![advancers, decliners, unchanged].every(Number.isInteger) ||
      advancers + decliners + unchanged === 0) return null;
  return { advancers, decliners, unchanged };
}

function parseIndexQuote(payload: unknown, symbol: IndexSymbol, session: Session) {
  const row = record(record(record(payload).domesticIndex)[symbol]);
  const meta = record(row.meta);
  if (row.itemCode !== symbol || meta.exchangeCode !== "KRX" || meta.marketCode !== symbol || meta.zoneId !== "Asia/Seoul") return null;
  const data = record(row.price);
  const price = positive(data.currentPrice);
  const asOf = sessionTime(data.localTradedAt, session);
  if (price === null || !asOf) return null;
  return { price, asOf, turnover: nonNegative(data.tradingValue), breadth: parseBreadth(row.breadth) };
}

function parseIndexChart(payload: unknown, symbol: IndexSymbol, session: Session): IndexChart | null {
  const row = record(payload);
  if (row.code !== symbol || row.stockExchangeType !== "KRX" || row.infoType !== "index" ||
      row.periodType !== "day" || compactDate(row.tradeBaseAt) !== session.date ||
      !Array.isArray(row.priceInfos)) return null;
  const pointsByTime = new Map<string, IndexPoint>();
  for (const item of row.priceInfos) {
    const info = record(item);
    const time = sessionTime(compactTime(info.localDateTime), session);
    const value = positive(info.currentPrice);
    if (time && value !== null) pointsByTime.set(time, { time, value });
  }
  const previousDate = compactDate(row.lastTradeBaseAt);
  const previousClose = previousDate && previousDate < session.date ? positive(row.lastClosePrice) : null;
  const points = [...pointsByTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  return { points, previousClose, previousDate: previousClose === null ? null : previousDate };
}

export async function fetchNaverLiveIndex(symbol: IndexSymbol, date: string, openAt: number, closeAt: number, now: number, fetcher: typeof fetch = fetch) {
  const session = { date, openAt, closeAt, now };
  const [quote, chart] = await Promise.all([
    readJson(`/integration/v1/indicators?domesticIndexCodes=${symbol}&includeBreadth=true`, fetcher)
      .then(payload => parseIndexQuote(payload, symbol, session)).catch(() => null),
    readJson(`/chart/domestic/index/${symbol}?periodType=day`, fetcher)
      .then(payload => parseIndexChart(payload, symbol, session)).catch(() => null),
  ]);
  const point = chart?.points.at(-1);
  return {
    price: quote?.price ?? point?.value ?? null,
    asOf: quote?.asOf ?? point?.time ?? null,
    points: chart?.points ?? [],
    previousClose: chart?.previousClose ?? null,
    previousDate: chart?.previousDate ?? null,
    turnover: quote?.turnover ?? null,
    breadth: quote?.breadth ?? null,
  };
}
