import { seoulToday } from "@/lib/format";
import { ok, stale, type SourceResult } from "@/lib/sources/types";

const MARKET_CAP_URL = "https://m.stock.naver.com/api/stocks/marketValue";
const INDEX_URL = "https://m.stock.naver.com/api/index";
const LIMIT = 20;
const HEADERS = { "user-agent": "Mozilla/5.0" };

export type NaverRank = {
  rank: number;
  itemCode: string;
  name: string;
  price: number | null;
  changePct: number | null;
  marketCapKrw: number | null;
};

export type NaverIndex = {
  itemCode: string;
  name: string;
  price: number;
  changePct: number | null;
};

export type NaverBreadth = {
  market: "KOSPI" | "KOSDAQ";
  date: string;
  advancers: number;
  decliners: number;
  unchanged: number;
};

export type NaverTrading = {
  market: "KOSPI" | "KOSDAQ";
  date: string;
  valueEok: number;
};

export type NaverBoard = {
  ranks: { market: "KOSPI" | "KOSDAQ"; rows: NaverRank[] }[];
  indexes: NaverIndex[];
  breadth: NaverBreadth[];
  trading: NaverTrading[];
};

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** 네이버 marketValue 는 억 원 단위다. raw 가 이미 원 단위(1조 이상)면 그대로 쓴다. */
export function naverCapToKrw(raw: unknown, text: unknown): number | null {
  const n = parseLooseNumber(raw) ?? parseLooseNumber(text);
  if (n == null || n <= 0) return null;
  return n >= 1e12 ? n : n * 1e8;
}

export function parseNaverMarketCap(payload: unknown, limit = LIMIT): NaverRank[] | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { stocks?: unknown }).stocks)) return null;
  const stocks = (payload as { stocks: unknown[] }).stocks;
  const ranks: NaverRank[] = [];
  for (const stock of stocks) {
    if (!stock || typeof stock !== "object") continue;
    const row = stock as Record<string, unknown>;
    if (row.stockEndType && row.stockEndType !== "stock") continue;
    const itemCode = String(row.itemCode ?? "").trim();
    const name = String(row.stockName ?? "").trim();
    if (!itemCode || !name) continue;
    ranks.push({
      rank: ranks.length + 1,
      itemCode,
      name,
      price: parseLooseNumber(row.closePriceRaw) ?? parseLooseNumber(row.closePrice),
      changePct: parseLooseNumber(row.fluctuationsRatio),
      marketCapKrw: naverCapToKrw(row.marketValueRaw, row.marketValue),
    });
    if (ranks.length >= limit) break;
  }
  return ranks.length ? ranks : null;
}

function countField(value: unknown): number | null {
  const n = parseLooseNumber(value);
  if (n == null || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function sessionDate(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return fallback;
}

/** 지수 대금 문자열을 억 원으로 바꾼다. 단위가 없으면 추측하지 않는다. 0은 장 시작 전으로 보고 버린다. */
export function tradingTextToEok(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").replace(/\s+/g, "").match(/^(\d+(?:\.\d+)?)(백만|억)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return match[2] === "백만" ? amount / 100 : amount;
}

export function parseNaverTradingValue(payload: unknown, market: "KOSPI" | "KOSDAQ", fallbackDate: string): NaverTrading | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (!Array.isArray(row.totalInfos)) return null;
  const item = row.totalInfos.find((entry) => entry && typeof entry === "object" && (entry as { code?: unknown }).code === "accumulatedTradingValue") as { value?: unknown } | undefined;
  const valueEok = tradingTextToEok(item?.value);
  if (valueEok == null) return null;
  const deal = row.dealTrendInfo;
  const bizdate = deal && typeof deal === "object" ? (deal as { bizdate?: unknown }).bizdate : undefined;
  return { market, date: sessionDate(bizdate, fallbackDate), valueEok };
}

/** 상한·하한은 상승·하락 안의 부분집합이라 더하지 않는다. 세 칸이 모두 0이면 장 시작 전으로 보고 버린다. */
export function parseNaverBreadth(payload: unknown, market: "KOSPI" | "KOSDAQ", fallbackDate: string): NaverBreadth | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const info = row.upDownStockInfo;
  if (!info || typeof info !== "object") return null;
  const counts = info as Record<string, unknown>;
  const advancers = countField(counts.riseCount);
  const decliners = countField(counts.fallCount);
  const unchanged = countField(counts.steadyCount);
  if (advancers == null || decliners == null || unchanged == null) return null;
  if (advancers + decliners + unchanged === 0) return null;
  const deal = row.dealTrendInfo;
  const bizdate = deal && typeof deal === "object" ? (deal as { bizdate?: unknown }).bizdate : undefined;
  return { market, date: sessionDate(bizdate, fallbackDate), advancers, decliners, unchanged };
}

export function parseNaverIndex(payload: unknown): NaverIndex | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const itemCode = String(row.itemCode ?? "").trim();
  const name = String(row.stockName ?? "").trim();
  const price = parseLooseNumber(row.closePriceRaw) ?? parseLooseNumber(row.closePrice);
  if (!itemCode || !name || price == null) return null;
  return {
    itemCode,
    name,
    price,
    changePct: parseLooseNumber(row.fluctuationsRatio),
  };
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchNaverBoard(now = new Date()): Promise<SourceResult<NaverBoard>> {
  const ranks: NaverBoard["ranks"] = [];
  const indexes: NaverIndex[] = [];
  const breadth: NaverBreadth[] = [];
  const trading: NaverTrading[] = [];
  const problems: string[] = [];
  const fallbackDate = seoulToday(now);

  for (const market of ["KOSPI", "KOSDAQ"] as const) {
    try {
      const payload = await readJson(`${MARKET_CAP_URL}/${market}?page=1&pageSize=${LIMIT}`);
      const rows = parseNaverMarketCap(payload, LIMIT);
      if (!rows) problems.push(`${market} 응답 형식`);
      else ranks.push({ market, rows });
    } catch (error) {
      problems.push(`${market} ${error instanceof Error ? error.message : "실패"}`);
    }
  }

  for (const code of ["KOSPI", "KOSDAQ"] as const) {
    try {
      const payload = await readJson(`${INDEX_URL}/${code}/basic`);
      const index = parseNaverIndex(payload);
      if (!index) problems.push(`${code} 지수 형식`);
      else indexes.push(index);
    } catch (error) {
      problems.push(`${code} 지수 ${error instanceof Error ? error.message : "실패"}`);
    }
    try {
      const payload = await readJson(`${INDEX_URL}/${code}/integration`);
      const row = parseNaverBreadth(payload, code, fallbackDate);
      if (!row) problems.push(`${code} 등락 형식`);
      else breadth.push(row);
      const value = parseNaverTradingValue(payload, code, fallbackDate);
      if (value) trading.push(value);
    } catch (error) {
      problems.push(`${code} 등락 ${error instanceof Error ? error.message : "실패"}`);
    }
  }

  if (!ranks.length && !indexes.length && !breadth.length && !trading.length) {
    return stale(problems.join(", ") || "네이버 시세를 가져오지 못했습니다.");
  }
  return ok({ ranks, indexes, breadth, trading });
}
