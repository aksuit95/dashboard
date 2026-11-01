import { proxyNames, type ProxyNameConfig, type ProxyRange, type ProxyVenue } from "@/config/proxy";

/**
 * 네이버 현재가, 바이낸스 USDT 무기한, 하이퍼리퀴드 xyz 무기한.
 * 바이낸스 lastFundingRate 는 펀딩 주기 금리라 시간당으로 나눈다.
 * 하이퍼리퀴드 funding 은 이미 시간당이다.
 */

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type NaverProxyQuote = {
  price: number;
  previousClose: number | null;
  regularClose: number | null;
  nxtPrice: number | null;
  change: number | null;
  changePct: number | null;
  sessionLabel: string;
  asOf: string | null;
  tradeDate: string | null;
};

export type PerpQuote = {
  symbol: string;
  markUsd: number | null;
  quoteVolumeUsd: number | null;
  openInterest: number | null;
  /** 시간당 펀딩. 0.0001 이면 0.01% */
  fundingHourly: number | null;
};

export type ProxyFx = {
  upbitUsdt: number | null;
  naverUsdKrw: number | null;
};

export type ProxyNameQuote = {
  id: string;
  name: string;
  code: string;
  binanceSymbol: string;
  hyperliquidCoin: string;
  naver: NaverProxyQuote | null;
  binance: PerpQuote | null;
  hyperliquid: PerpQuote | null;
  errors: Partial<Record<ProxyVenue, string>>;
};

export type ProxyBoard = {
  asOf: string;
  fx: ProxyFx;
  names: ProxyNameQuote[];
};

export type CandleBook = {
  unit: "KRW" | "USD";
  candles: Candle[];
};

const UA = "Mozilla/5.0";

export function parseDecimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function seoulClock(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return {
    hour: Number.isFinite(hour) ? (hour === 24 ? 0 : hour) : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export function proxySessionLabel(input: {
  marketStatus: string | null;
  overMarketStatus: string | null;
  now: Date;
}): string {
  const { hour, minute } = seoulClock(input.now);
  const minutes = hour * 60 + minute;
  const regular = minutes >= 9 * 60 && minutes < 15 * 60 + 30;
  const overOpen = input.overMarketStatus === "OPEN";
  if (input.marketStatus === "OPEN" && regular) return "정규장";
  if (overOpen && minutes < 9 * 60) return "시간외";
  if (overOpen || (minutes >= 15 * 60 + 30 && minutes < 20 * 60)) return "정규장 종료";
  return "장마감";
}

function monthDay(iso: string | null, now: Date): string {
  const date = iso ? new Date(iso) : now;
  const stamp = Number.isNaN(date.getTime()) ? now : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(stamp);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${month}/${day}`;
}

export function parseNaverProxyQuote(payload: unknown, now: Date): NaverProxyQuote | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const regularClose = parseDecimal(row.closePrice);
  if (regularClose == null) return null;
  const over = row.overMarketPriceInfo;
  const overRow = over && typeof over === "object" ? (over as Record<string, unknown>) : null;
  const nxtPrice = overRow ? parseDecimal(overRow.overPrice) : null;
  const sessionLabel = proxySessionLabel({
    marketStatus: typeof row.marketStatus === "string" ? row.marketStatus : null,
    overMarketStatus: overRow && typeof overRow.overMarketStatus === "string" ? overRow.overMarketStatus : null,
    now,
  });
  const usingNxt = sessionLabel !== "정규장" && nxtPrice != null;
  const source = usingNxt && overRow ? overRow : row;
  const change = parseDecimal(source.compareToPreviousClosePrice);
  const regularChange = parseDecimal(row.compareToPreviousClosePrice);
  const asOf = typeof source.localTradedAt === "string" ? source.localTradedAt : typeof row.localTradedAt === "string" ? row.localTradedAt : null;
  return {
    price: usingNxt ? nxtPrice : regularClose,
    previousClose: regularChange == null ? null : regularClose - regularChange,
    regularClose,
    nxtPrice,
    change,
    changePct: parseDecimal(source.fluctuationsRatio),
    sessionLabel,
    asOf,
    tradeDate: monthDay(asOf, now),
  };
}

export function parseUpbitUsdt(payload: unknown): number | null {
  if (!Array.isArray(payload) || !payload[0] || typeof payload[0] !== "object") return null;
  return parseDecimal((payload[0] as { trade_price?: unknown }).trade_price);
}

export function parseNaverFxClose(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const result = (payload as { result?: unknown }).result;
  if (!Array.isArray(result) || !result[0] || typeof result[0] !== "object") return null;
  return parseDecimal((result[0] as { closePrice?: unknown }).closePrice);
}

export function parseBinancePerp(input: {
  symbol: string;
  premium: unknown;
  ticker: unknown;
  openInterest: unknown;
  fundingIntervalHours: number | null;
}): PerpQuote | null {
  if (!input.premium || typeof input.premium !== "object") return null;
  const premium = input.premium as Record<string, unknown>;
  const markUsd = parseDecimal(premium.markPrice);
  if (markUsd == null) return null;
  const ticker = input.ticker && typeof input.ticker === "object" ? (input.ticker as Record<string, unknown>) : null;
  const oi = input.openInterest && typeof input.openInterest === "object" ? (input.openInterest as Record<string, unknown>) : null;
  const interval = input.fundingIntervalHours;
  const periodRate = parseDecimal(premium.lastFundingRate);
  const fundingHourly = periodRate == null || interval == null || interval <= 0 ? null : periodRate / interval;
  return {
    symbol: input.symbol,
    markUsd,
    quoteVolumeUsd: ticker ? parseDecimal(ticker.quoteVolume) : null,
    openInterest: oi ? parseDecimal(oi.openInterest) : null,
    fundingHourly,
  };
}

export function parseHyperliquidPerp(payload: unknown, coin: string): PerpQuote | null {
  if (!Array.isArray(payload) || payload.length < 2) return null;
  const meta = payload[0];
  const contexts = payload[1];
  if (!meta || typeof meta !== "object" || !Array.isArray(contexts)) return null;
  const universe = (meta as { universe?: unknown }).universe;
  if (!Array.isArray(universe)) return null;
  const index = universe.findIndex((asset) => asset && typeof asset === "object" && (asset as { name?: unknown }).name === coin);
  if (index < 0 || !contexts[index] || typeof contexts[index] !== "object") return null;
  const ctx = contexts[index] as Record<string, unknown>;
  const markUsd = parseDecimal(ctx.markPx);
  if (markUsd == null) return null;
  return {
    symbol: coin,
    markUsd,
    quoteVolumeUsd: parseDecimal(ctx.dayNtlVlm),
    openInterest: parseDecimal(ctx.openInterest),
    fundingHourly: parseDecimal(ctx.funding),
  };
}

export function kimchiPercent(upbitUsdt: number | null, naverUsdKrw: number | null): number | null {
  if (upbitUsdt == null || naverUsdKrw == null || naverUsdKrw === 0) return null;
  return (upbitUsdt / naverUsdKrw - 1) * 100;
}

/** 김프 ON 이면 업비트 USDT, OFF 이면 네이버 원달러. 없는 쪽은 있는 환율로 대체한다. */
export function fxRate(fx: ProxyFx, kimchiOn: boolean): number | null {
  const preferred = kimchiOn ? fx.upbitUsdt : fx.naverUsdKrw;
  const fallback = kimchiOn ? fx.naverUsdKrw : fx.upbitUsdt;
  return preferred ?? fallback;
}

export function premiumVs(krw: number | null, base: number | null): { pct: number; diff: number } | null {
  if (krw == null || base == null || base === 0) return null;
  return { pct: ((krw - base) / base) * 100, diff: krw - base };
}

export function seoulCompactToUnix(compact: string): number | null {
  if (!/^\d{14}$/.test(compact)) return null;
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:${compact.slice(12, 14)}+09:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function candleFrom(time: number, open: unknown, high: unknown, low: unknown, close: unknown): Candle | null {
  const o = parseDecimal(open);
  const h = parseDecimal(high);
  const l = parseDecimal(low);
  const c = parseDecimal(close);
  if (o == null || h == null || l == null || c == null) return null;
  return { time, open: o, high: h, low: l, close: c };
}

function dedupeCandles(candles: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const candle of candles) map.set(candle.time, candle);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function bucketCandles(candles: Candle[], bucketSec: number): Candle[] {
  if (bucketSec <= 1) return dedupeCandles(candles);
  const map = new Map<number, Candle>();
  for (const candle of dedupeCandles(candles)) {
    const key = Math.floor(candle.time / bucketSec) * bucketSec;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...candle, time: key });
      continue;
    }
    prev.high = Math.max(prev.high, candle.high);
    prev.low = Math.min(prev.low, candle.low);
    prev.close = candle.close;
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function parseNaverCandles(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) return [];
  const candles: Candle[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const stamp = typeof item.localDateTime === "string"
      ? item.localDateTime
      : typeof item.localDate === "string"
        ? `${item.localDate}000000`
        : null;
    if (!stamp) continue;
    const time = seoulCompactToUnix(stamp);
    if (time == null) continue;
    const candle = candleFrom(time, item.openPrice, item.highPrice, item.lowPrice, item.currentPrice ?? item.closePrice);
    if (candle) candles.push(candle);
  }
  return dedupeCandles(candles);
}

export function parseBinanceKlines(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) return [];
  const candles: Candle[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const openMs = parseDecimal(row[0]);
    if (openMs == null) continue;
    const candle = candleFrom(Math.floor(openMs / 1000), row[1], row[2], row[3], row[4]);
    if (candle) candles.push(candle);
  }
  return dedupeCandles(candles);
}

export function parseHyperliquidCandles(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) return [];
  const candles: Candle[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const openMs = parseDecimal(item.t);
    if (openMs == null) continue;
    const candle = candleFrom(Math.floor(openMs / 1000), item.o, item.h, item.l, item.c);
    if (candle) candles.push(candle);
  }
  return dedupeCandles(candles);
}

type FetchLike = typeof fetch;

async function getJson(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json", "user-agent": UA, ...init?.headers },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

async function attempt<T>(work: () => Promise<T | null>): Promise<{ data: T | null; error?: string }> {
  try {
    const data = await work();
    if (data == null) return { data: null, error: "응답에 시세가 없습니다." };
    return { data };
  } catch {
    return { data: null, error: "조회에 실패했습니다." };
  }
}

function fundingHours(payload: unknown): Map<string, number> {
  const map = new Map<string, number>();
  if (!Array.isArray(payload)) return map;
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const item = row as { symbol?: unknown; fundingIntervalHours?: unknown };
    const hours = parseDecimal(item.fundingIntervalHours);
    if (typeof item.symbol === "string" && hours != null && hours > 0) map.set(item.symbol, hours);
  }
  return map;
}

async function loadBinance(fetchImpl: FetchLike, symbol: string, intervalHours: number | null): Promise<PerpQuote | null> {
  const [premium, ticker, openInterest] = await Promise.all([
    getJson(fetchImpl, `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
    getJson(fetchImpl, `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`),
    getJson(fetchImpl, `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`).catch(() => null),
  ]);
  return parseBinancePerp({ symbol, premium, ticker, openInterest, fundingIntervalHours: intervalHours });
}

function seoulStamp(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}${pick("month")}${pick("day")}${hour}${pick("minute")}${pick("second")}`;
}

const rangePlan: Record<ProxyRange, { binanceInterval: string; binanceLimit: number; hlInterval: string; hlMs: number; naverKind: "minute" | "day"; naverDays: number; bucketSec: number }> = {
  "1D": { binanceInterval: "1m", binanceLimit: 1440, hlInterval: "1m", hlMs: 86_400_000, naverKind: "minute", naverDays: 1, bucketSec: 0 },
  "1W": { binanceInterval: "15m", binanceLimit: 672, hlInterval: "15m", hlMs: 7 * 86_400_000, naverKind: "minute", naverDays: 7, bucketSec: 900 },
  "1M": { binanceInterval: "4h", binanceLimit: 186, hlInterval: "4h", hlMs: 31 * 86_400_000, naverKind: "day", naverDays: 31, bucketSec: 0 },
  "3M": { binanceInterval: "1d", binanceLimit: 96, hlInterval: "1d", hlMs: 96 * 86_400_000, naverKind: "day", naverDays: 96, bucketSec: 0 },
  "1Y": { binanceInterval: "1d", binanceLimit: 370, hlInterval: "1d", hlMs: 370 * 86_400_000, naverKind: "day", naverDays: 370, bucketSec: 0 },
};

export async function loadProxyBoard(fetchImpl: FetchLike = fetch, now = new Date()): Promise<ProxyBoard> {
  const [fxUpbit, fxNaver, hyperliquid, fundingInfo] = await Promise.all([
    attempt(() => getJson(fetchImpl, "https://api.upbit.com/v1/ticker?markets=KRW-USDT").then(parseUpbitUsdt)),
    attempt(() => getJson(fetchImpl, "https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=FX_USDKRW&page=1").then(parseNaverFxClose)),
    attempt(() => getJson(fetchImpl, "https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs", dex: "xyz" }),
    })),
    attempt(() => getJson(fetchImpl, "https://fapi.binance.com/fapi/v1/fundingInfo")),
  ]);
  const intervals = fundingHours(fundingInfo.data);

  const names = await Promise.all(proxyNames.map((name) => loadName(fetchImpl, name, now, hyperliquid.data, hyperliquid.error, intervals)));
  return {
    asOf: now.toISOString(),
    fx: { upbitUsdt: fxUpbit.data, naverUsdKrw: fxNaver.data },
    names,
  };
}

async function loadName(
  fetchImpl: FetchLike,
  name: ProxyNameConfig,
  now: Date,
  hyperliquidPayload: unknown,
  hyperliquidError: string | undefined,
  intervals: Map<string, number>,
): Promise<ProxyNameQuote> {
  const [naver, binance] = await Promise.all([
    attempt(() => getJson(fetchImpl, `https://m.stock.naver.com/api/stock/${name.code}/basic`).then((payload) => parseNaverProxyQuote(payload, now))),
    attempt(() => loadBinance(fetchImpl, name.binanceSymbol, intervals.get(name.binanceSymbol) ?? null)),
  ]);
  const hyper = parseHyperliquidPerp(hyperliquidPayload, name.hyperliquidCoin);
  return {
    id: name.id,
    name: name.name,
    code: name.code,
    binanceSymbol: name.binanceSymbol,
    hyperliquidCoin: name.hyperliquidCoin,
    naver: naver.data,
    binance: binance.data,
    hyperliquid: hyper,
    errors: {
      ...(naver.error ? { naver: naver.error } : {}),
      ...(binance.error ? { binance: binance.error } : {}),
      ...(hyper ? {} : { hyperliquid: hyperliquidError ?? "응답에 시세가 없습니다." }),
    },
  };
}

export async function loadProxyCandles(
  id: string,
  venue: ProxyVenue,
  range: ProxyRange,
  fetchImpl: FetchLike = fetch,
  now = new Date(),
): Promise<CandleBook | null> {
  const name = proxyNames.find((item) => item.id === id);
  const plan = rangePlan[range];
  if (!name || !plan) return null;
  if (venue === "naver") {
    const start = new Date(now.getTime() - plan.naverDays * 86_400_000);
    const url = plan.naverKind === "minute"
      ? `https://api.stock.naver.com/chart/domestic/item/${name.code}/minute?startDateTime=${seoulStamp(start)}&endDateTime=${seoulStamp(now)}`
      : `https://api.stock.naver.com/chart/domestic/item/${name.code}/day?startDateTime=${seoulStamp(start).slice(0, 8)}000000&endDateTime=${seoulStamp(now).slice(0, 8)}235959`;
    const candles = parseNaverCandles(await getJson(fetchImpl, url));
    return { unit: "KRW", candles: plan.bucketSec ? bucketCandles(candles, plan.bucketSec) : candles };
  }
  if (venue === "binance") {
    const candles = parseBinanceKlines(await getJson(
      fetchImpl,
      `https://fapi.binance.com/fapi/v1/klines?symbol=${name.binanceSymbol}&interval=${plan.binanceInterval}&limit=${plan.binanceLimit}`,
    ));
    return { unit: "USD", candles };
  }
  const end = now.getTime();
  const candles = parseHyperliquidCandles(await getJson(fetchImpl, "https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin: name.hyperliquidCoin, interval: plan.hlInterval, startTime: end - plan.hlMs, endTime: end },
    }),
  }));
  return { unit: "USD", candles };
}
