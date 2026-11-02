import { parseDecimal } from "@/lib/sources/proxy-board";

/** 글로벌 시장 카드. 해외 지표는 야후 차트 메타, 코스피200 선물은 네이버 FUT. */

export type MarketCard = {
  id: string;
  name: string;
  symbol: string;
  venue: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  session: "live" | "open" | "break" | "pre" | "unknown" | "closed" | "missing";
  tradedAt?: string;
  delayed?: boolean;
  /** points 는 소수 2자리, percent 는 % , usd 는 $, krw 는 환율 */
  unit: "points" | "percent" | "usd" | "krw";
  error?: string;
};

export type MarketBoard = {
  asOf: string;
  futures: MarketCard[];
  asia: MarketCard[];
  usIndicators: MarketCard[];
  currencies: MarketCard[];
  macro: MarketCard[];
};

export type YahooChartQuote = {
  price: number;
  change: number | null;
  changePct: number | null;
  tradedAtMs: number | null;
  regularSession: { startMs: number; endMs: number } | null;
};

const FRESH_MS = 20 * 60 * 1000;

export function parseYahooChartQuote(payload: unknown): YahooChartQuote | null {
  if (!payload || typeof payload !== "object") return null;
  const result = (payload as { chart?: { result?: unknown[] } }).chart?.result?.[0];
  if (!result || typeof result !== "object") return null;
  const meta = (result as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return null;
  const row = meta as Record<string, unknown>;
  const price = parseDecimal(row.fulldayPrice) ?? parseDecimal(row.regularMarketPrice);
  if (price == null) return null;
  const explicitChange = parseDecimal(row.fulldayChange);
  const previous = parseDecimal(row.chartPreviousClose);
  const change = explicitChange ?? (previous == null ? null : price - previous);
  const explicitPct = parseDecimal(row.fulldayChangePercent) ?? parseDecimal(row.regularMarketChangePercent);
  const changePct = explicitPct ?? (change == null || previous == null || previous === 0 ? null : (change / previous) * 100);
  const tradedAt = parseDecimal(row.regularMarketTime);
  const regular = (row.currentTradingPeriod as { regular?: { start?: unknown; end?: unknown } } | undefined)?.regular;
  const start = parseDecimal(regular?.start);
  const end = parseDecimal(regular?.end);
  return {
    price,
    change,
    changePct,
    tradedAtMs: tradedAt == null ? null : tradedAt * 1000,
    regularSession: start != null && end != null && end > start ? { startMs: start * 1000, endMs: end * 1000 } : null,
  };
}

export function parseNaverFuturesQuote(payload: unknown): { price: number; change: number | null; changePct: number | null; session: "live" | "closed" } | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const price = parseDecimal(row.closePrice);
  if (price == null) return null;
  return {
    price,
    change: parseDecimal(row.compareToPreviousClosePrice),
    changePct: parseDecimal(row.fluctuationsRatio),
    session: row.marketStatus === "OPEN" ? "live" : "closed",
  };
}

/** 미국 정규장 09:30–16:00 뉴욕. 주말은 장마감. */
export function usCashSession(now: Date): "live" | "closed" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const minutes = (hour === 24 ? 0 : hour) * 60 + minute;
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "live";
  return "closed";
}

export function clockSession(tradedAtMs: number | null, nowMs: number): "live" | "closed" {
  if (tradedAtMs == null || !Number.isFinite(tradedAtMs)) return "closed";
  return nowMs - tradedAtMs <= FRESH_MS ? "live" : "closed";
}

/** Exchange sessions and quote freshness are independent. Vendor periods guard against holidays. */
export function asiaMarketSession(symbol: string, period: YahooChartQuote["regularSession"], now: Date): MarketCard["session"] {
  const japan = symbol === "^N225";
  const taiwan = symbol === "^TWII";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: japan ? "Asia/Tokyo" : taiwan ? "Asia/Taipei" : "Asia/Shanghai",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const read = (key: string) => parts.find((part) => part.type === key)?.value;
  if (read("weekday") === "Sat" || read("weekday") === "Sun") return "closed";
  const minute = Number(read("hour")) * 60 + Number(read("minute"));
  // https://www.twse.com.tw/en/about/company/service.html
  // https://english.sse.com.cn/start/trading/schedule/
  // https://www.jpx.co.jp/english/equities/trading/domestic/01.html
  const start = taiwan || japan ? 540 : 570;
  const end = japan ? 930 : taiwan ? 810 : 900;
  if (minute >= end) return "closed";
  // A missing or stale period cannot establish whether today is a trading day.
  if (!period || period.endMs <= now.getTime() || period.startMs - now.getTime() > 24 * 60 * 60 * 1000) return "unknown";
  if (minute < start) return "pre";
  if (now.getTime() < period.startMs) return "unknown";
  if (!taiwan && minute >= 690 && minute < (japan ? 750 : 780)) return "break";
  return "open";
}

type FetchLike = typeof fetch;

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

const futuresSpec = [
  { id: "NQ=F", name: "나스닥100 선물", symbol: "NQUSD", venue: "CME · 24h", unit: "points" as const, session: "clock" as const },
  { id: "ES=F", name: "S&P 500 선물", symbol: "ESUSD", venue: "CME · 24h", unit: "points" as const, session: "clock" as const },
];

const asiaSpec = [
  { id: "^N225", name: "닛케이225", symbol: "N225", venue: "일본 · 현물 지수", unit: "points" as const, session: "clock" as const },
  { id: "^TWII", name: "대만 가권", symbol: "TWII", venue: "대만 · 현물 지수", unit: "points" as const, session: "clock" as const },
  { id: "000688.SS", name: "중국 과창판50", symbol: "000688", venue: "상하이 · STAR 50 현물 지수", unit: "points" as const, session: "clock" as const },
];

const usIndicatorsSpec = [
  { id: "^SOX", name: "필라델피아 반도체 SOX", symbol: "SOX", venue: "미국 · 현물 지수", unit: "points" as const, session: "clock" as const },
  { id: "^VIX", name: "VIX 변동성 지수", symbol: "VIX", venue: "CBOE · 현물 지수", unit: "points" as const, session: "clock" as const },
];

const currenciesSpec = [
  { id: "KRW=X", name: "원/달러 환율", symbol: "USDKRW", venue: "FX · 24h", unit: "krw" as const, session: "clock" as const },
  { id: "DX-Y.NYB", name: "달러 인덱스 DXY", symbol: "DXY", venue: "ICE · 달러 지수", unit: "points" as const, session: "clock" as const },
];

const macroSpec = [
  { id: "^TNX", name: "미국 10년 국채 금리", symbol: "^TNX", venue: "CBOE", unit: "percent" as const, session: "us-cash" as const },
  { id: "CL=F", name: "WTI 원유", symbol: "CLUSD", venue: "NYMEX · 24h", unit: "usd" as const, session: "clock" as const },
];

async function yahooCard(
  fetchImpl: FetchLike,
  spec: (typeof futuresSpec)[number] | (typeof macroSpec)[number] | (typeof asiaSpec)[number] | (typeof usIndicatorsSpec)[number] | (typeof currenciesSpec)[number],
  now: Date,
): Promise<MarketCard> {
  try {
    const payload = await getJson(fetchImpl, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.id)}?interval=1d&range=5d`);
    const quote = parseYahooChartQuote(payload);
    if (!quote) return blank(spec, "응답에 시세가 없습니다.");
    const isAsia = asiaSpec.some((item) => item.id === spec.id);
    const session = isAsia ? asiaMarketSession(spec.id, quote.regularSession, now)
      : spec.session === "us-cash" ? usCashSession(now) : clockSession(quote.tradedAtMs, now.getTime());
    return {
      ...spec, price: quote.price, change: quote.change, changePct: quote.changePct, session,
      ...(quote.tradedAtMs == null ? {} : { tradedAt: new Date(quote.tradedAtMs).toISOString() }),
      delayed: isAsia && session === "open" && quote.tradedAtMs != null && now.getTime() - quote.tradedAtMs > FRESH_MS,
    };
  } catch {
    return blank(spec, "조회에 실패했습니다.");
  }
}

function blank(spec: { id: string; name: string; symbol: string; venue: string; unit: MarketCard["unit"] }, error: string): MarketCard {
  return { ...spec, price: null, change: null, changePct: null, session: "missing", error };
}

export async function loadMarketBoard(fetchImpl: FetchLike = fetch, now = new Date()): Promise<MarketBoard> {
  const [kospi, futures, asia, usIndicators, currencies, macro] = await Promise.all([
    loadKospiFutures(fetchImpl),
    Promise.all(futuresSpec.map((spec) => yahooCard(fetchImpl, spec, now))),
    Promise.all(asiaSpec.map((spec) => yahooCard(fetchImpl, spec, now))),
    Promise.all(usIndicatorsSpec.map((spec) => yahooCard(fetchImpl, spec, now))),
    Promise.all(currenciesSpec.map((spec) => yahooCard(fetchImpl, spec, now))),
    Promise.all(macroSpec.map((spec) => yahooCard(fetchImpl, spec, now))),
  ]);
  return {
    asOf: now.toISOString(),
    futures: [kospi, ...futures],
    asia,
    usIndicators,
    currencies,
    macro,
  };
}

async function loadKospiFutures(fetchImpl: FetchLike): Promise<MarketCard> {
  const spec = { id: "FUT", name: "코스피200 야간선물", symbol: "K200=F", venue: "KRX Night", unit: "points" as const };
  try {
    const payload = await getJson(fetchImpl, "https://m.stock.naver.com/api/index/FUT/basic");
    const quote = parseNaverFuturesQuote(payload);
    if (!quote) return blank(spec, "응답에 시세가 없습니다.");
    return { ...spec, price: quote.price, change: quote.change, changePct: quote.changePct, session: quote.session };
  } catch {
    return blank(spec, "조회에 실패했습니다.");
  }
}
