import type { DailyBarPayload, QuotePayload, SourceResult } from "@/lib/sources/types";
import { empty, ok, stale } from "@/lib/sources/types";

type Crumb = { cookie: string; crumb: string };

let crumbCache: Crumb | null = null;

const UA = "Mozilla/5.0";

async function loadCrumb(): Promise<Crumb> {
  if (crumbCache) return crumbCache;
  const seed = await fetch("https://fc.yahoo.com", { headers: { "user-agent": UA }, redirect: "manual" });
  const cookies = seed.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Yahoo 쿠키를 받지 못했습니다.");
  const crumbResponse = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "user-agent": UA, cookie },
  });
  const crumb = (await crumbResponse.text()).trim();
  if (!crumbResponse.ok || !crumb || crumb.includes("{")) throw new Error("Yahoo crumb 를 받지 못했습니다.");
  crumbCache = { cookie, crumb };
  return crumbCache;
}

type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  preMarketPrice?: number;
  postMarketPrice?: number;
  regularMarketTime?: number;
  marketState?: string;
  currency?: string;
  sharesOutstanding?: number;
  marketCap?: number;
  navPrice?: number;
};

function sessionOf(state: string | undefined, always: boolean): QuotePayload["session"] {
  if (!state) return "unknown";
  if (always) return state === "CLOSED" ? "closed" : "live";
  return state === "REGULAR" ? "live" : "closed";
}

function priceOf(quote: YahooQuote): number | null {
  if (quote.marketState === "PRE" && quote.preMarketPrice) return quote.preMarketPrice;
  if ((quote.marketState === "POST" || quote.marketState === "POSTPOST") && quote.postMarketPrice) {
    return quote.postMarketPrice;
  }
  return typeof quote.regularMarketPrice === "number" ? quote.regularMarketPrice : null;
}

export async function fetchYahooQuotes(
  symbols: string[],
  alwaysIds: Set<string>,
): Promise<SourceResult<Map<string, QuotePayload>>> {
  if (!symbols.length) return empty("요청 심볼이 없습니다.");
  try {
    const auth = await loadCrumb();
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}&crumb=${encodeURIComponent(auth.crumb)}`;
    const response = await fetch(url, { headers: { "user-agent": UA, cookie: auth.cookie } });
    if (response.status === 401) {
      crumbCache = null;
      return stale("Yahoo 인증이 거절되었습니다.");
    }
    if (!response.ok) return stale(`Yahoo 시세 응답 ${response.status}`);
    const body = (await response.json()) as { quoteResponse?: { result?: YahooQuote[] } };
    const result = body.quoteResponse?.result;
    if (!result?.length) return empty("Yahoo 시세가 비어 있습니다.");
    const map = new Map<string, QuotePayload>();
    for (const quote of result) {
      if (!quote.symbol) continue;
      const price = priceOf(quote);
      if (price == null) continue;
      map.set(quote.symbol, {
        price,
        previousClose: quote.regularMarketPreviousClose ?? null,
        asOf: quote.regularMarketTime ? new Date(quote.regularMarketTime * 1000).toISOString() : null,
        session: sessionOf(quote.marketState, alwaysIds.has(quote.symbol)),
        fundingHourly: null,
        sharesOutstanding: quote.sharesOutstanding ?? null,
        marketCap: quote.marketCap ?? null,
        marketCapCurrency: quote.currency ?? null,
        nav: quote.navPrice ?? null,
      });
    }
    if (!map.size) return empty("해석 가능한 Yahoo 시세가 없습니다.");
    return ok(map);
  } catch (error) {
    return stale(error instanceof Error ? error.message : "Yahoo 시세 수집 실패");
  }
}

export async function fetchYahooHistory(symbol: string, range = "5y"): Promise<SourceResult<DailyBarPayload[]>> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const response = await fetch(url, { headers: { "user-agent": UA } });
    if (!response.ok) return stale(`Yahoo 일별 응답 ${response.status}`);
    const body = (await response.json()) as {
      chart?: {
        result?: {
          meta?: { gmtoffset?: number };
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
        error?: { description?: string };
      };
    };
    const result = body.chart?.result?.[0];
    if (!result?.timestamp?.length) return empty(body.chart?.error?.description ?? "일별 데이터가 없습니다.");
    const offset = result.meta?.gmtoffset ?? 0;
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const bars: DailyBarPayload[] = [];
    result.timestamp.forEach((stamp, index) => {
      const close = closes[index];
      if (close == null || !Number.isFinite(close)) return;
      const date = new Date((stamp + offset) * 1000).toISOString().slice(0, 10);
      bars.push({ date, close });
    });
    if (!bars.length) return empty("종가가 있는 날이 없습니다.");
    return ok(bars);
  } catch (error) {
    return stale(error instanceof Error ? error.message : "Yahoo 일별 수집 실패");
  }
}

export function resetYahooAuth(): void {
  crumbCache = null;
}

export type YahooEtfFacts = {
  shares: number | null;
  nav: number | null;
  aum: number | null;
  holdings: { symbol: string; name: string; weight: number }[];
};

function yahooRaw(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return null;
  const raw = (value as { raw?: unknown }).raw;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** 비중 합이 1.5 이하면 비율(0.19)로 보고 퍼센트로 바꾼다. navPrice 만 NAV 로 쓴다. */
export function parseYahooEtfFacts(payload: unknown): YahooEtfFacts | null {
  if (!payload || typeof payload !== "object") return null;
  const result = (payload as { quoteSummary?: { result?: unknown[] } }).quoteSummary?.result?.[0];
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  const summary = row.summaryDetail as Record<string, unknown> | undefined;
  const stats = row.defaultKeyStatistics as Record<string, unknown> | undefined;
  const nav = yahooRaw(summary?.navPrice);
  const shares = yahooRaw(stats?.sharesOutstanding);
  const aum = yahooRaw(summary?.totalAssets) ?? yahooRaw(stats?.totalAssets);
  const holdings: YahooEtfFacts["holdings"] = [];
  const list = (row.topHoldings as { holdings?: unknown[] } | undefined)?.holdings;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const holding = item as Record<string, unknown>;
      const symbol = String(holding.symbol ?? "").trim();
      const name = String(holding.holdingName ?? symbol).trim();
      const weight = yahooRaw(holding.holdingPercent);
      if (!symbol || !name || weight == null || weight < 0) continue;
      holdings.push({ symbol, name, weight });
    }
  }
  const sum = holdings.reduce((total, item) => total + item.weight, 0);
  const scaled = sum > 0 && sum <= 1.5 ? holdings.map((item) => ({ ...item, weight: item.weight * 100 })) : holdings;
  if (nav == null && shares == null && aum == null && !scaled.length) return null;
  return { shares, nav, aum, holdings: scaled };
}

export async function fetchYahooEtfFacts(symbol: string): Promise<SourceResult<YahooEtfFacts>> {
  try {
    const auth = await loadCrumb();
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,topHoldings&crumb=${encodeURIComponent(auth.crumb)}`;
    const response = await fetch(url, { headers: { "user-agent": UA, cookie: auth.cookie } });
    if (response.status === 401) {
      crumbCache = null;
      return stale("Yahoo 인증이 거절되었습니다.");
    }
    if (!response.ok) return stale(`Yahoo ETF 응답 ${response.status}`);
    const parsed = parseYahooEtfFacts(await response.json());
    if (!parsed) return empty("Yahoo ETF 구성이 없습니다.");
    return ok(parsed);
  } catch (error) {
    return stale(error instanceof Error ? error.message : "Yahoo ETF 수집 실패");
  }
}
