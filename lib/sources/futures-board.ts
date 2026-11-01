import { parseDecimal } from "@/lib/sources/proxy-board";

/** 글로벌 선물·매크로 카드. 미국 선물은 야후 차트 메타, 코스피200 선물은 네이버 FUT. */

export type MarketCard = {
  id: string;
  name: string;
  symbol: string;
  venue: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  session: "live" | "closed" | "missing";
  /** points 는 소수 2자리, percent 는 % , usd 는 $, krw 는 환율 */
  unit: "points" | "percent" | "usd" | "krw";
  error?: string;
};

export type MarketBoard = {
  asOf: string;
  futures: MarketCard[];
  macro: MarketCard[];
};

export type YahooChartQuote = {
  price: number;
  change: number | null;
  changePct: number | null;
  tradedAtMs: number | null;
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
  return {
    price,
    change,
    changePct,
    tradedAtMs: tradedAt == null ? null : tradedAt * 1000,
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

const macroSpec = [
  { id: "^TNX", name: "미국 10년 국채 금리", symbol: "^TNX", venue: "CBOE", unit: "percent" as const, session: "us-cash" as const },
  { id: "CL=F", name: "WTI 원유", symbol: "CLUSD", venue: "NYMEX · 24h", unit: "usd" as const, session: "clock" as const },
  { id: "KRW=X", name: "원/달러 환율", symbol: "USDKRW", venue: "FX · 24h", unit: "krw" as const, session: "clock" as const },
];

async function yahooCard(
  fetchImpl: FetchLike,
  spec: (typeof futuresSpec)[number] | (typeof macroSpec)[number],
  now: Date,
): Promise<MarketCard> {
  try {
    const payload = await getJson(fetchImpl, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.id)}?interval=1d&range=5d`);
    const quote = parseYahooChartQuote(payload);
    if (!quote) return blank(spec, "응답에 시세가 없습니다.");
    const session = spec.session === "us-cash" ? usCashSession(now) : clockSession(quote.tradedAtMs, now.getTime());
    return { ...spec, price: quote.price, change: quote.change, changePct: quote.changePct, session };
  } catch {
    return blank(spec, "조회에 실패했습니다.");
  }
}

function blank(spec: { id: string; name: string; symbol: string; venue: string; unit: MarketCard["unit"] }, error: string): MarketCard {
  return { ...spec, price: null, change: null, changePct: null, session: "missing", error };
}

export async function loadMarketBoard(fetchImpl: FetchLike = fetch, now = new Date()): Promise<MarketBoard> {
  const [kospi, nasdaq, spx, tnx, wti, fx] = await Promise.all([
    loadKospiFutures(fetchImpl),
    yahooCard(fetchImpl, futuresSpec[0], now),
    yahooCard(fetchImpl, futuresSpec[1], now),
    yahooCard(fetchImpl, macroSpec[0], now),
    yahooCard(fetchImpl, macroSpec[1], now),
    yahooCard(fetchImpl, macroSpec[2], now),
  ]);
  return {
    asOf: now.toISOString(),
    futures: [kospi, nasdaq, spx],
    macro: [tnx, wti, fx],
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
