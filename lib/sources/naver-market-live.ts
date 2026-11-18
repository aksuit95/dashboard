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

async function readJson(path: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(`${NAVER_MARKET_API}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
    headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
  });
  if (!response.ok) throw new Error(`네이버 장중 시세 HTTP ${response.status}`);
  return response.json();
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
