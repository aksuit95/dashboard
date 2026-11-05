import { singleStockNames, type SingleStockProduct, type SingleStockSide } from "@/config/single-stock";
import { parseDecimal } from "@/lib/sources/proxy-board";
import { fetchKrxDailyCloses } from "@/lib/sources/krx-daily-prices";
import { minerviniSession } from "@/lib/market/minervini-session";

/** 단일종목 레버리지·인버스. 괴리율은 현재가와 iNAV 의 차이다. */

export type SingleStockCard = {
  code: string;
  brand: string;
  product: string;
  side: SingleStockSide;
  price: number | null;
  change: number | null;
  changePct: number | null;
  premium: number | null;
  error?: string;
};

export type SingleStockGroup = {
  code: string;
  name: string;
  price: number | null;
  changePct: number | null;
  priceAsOf: string;
  priceBasis: "KRX_REGULAR_CLOSE" | "KRX_REGULAR_LIVE";
  priceTime: string | null;
  products: SingleStockCard[];
};

export type SingleStockBoard = {
  asOf: string;
  names: SingleStockGroup[];
};

export function premiumPercent(price: number | null, iNav: number | null): number | null {
  if (price == null || iNav == null || iNav === 0) return null;
  return (price / iNav - 1) * 100;
}

export function parseSingleStockEtf(payload: unknown): { price: number; change: number | null; changePct: number | null; premium: number | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const price = parseDecimal(row.closePrice);
  if (price == null) return null;
  const iNav = parseDecimal(row.iNav);
  return {
    price,
    change: parseDecimal(row.compareToPreviousClosePrice),
    changePct: parseDecimal(row.fluctuationsRatio),
    premium: premiumPercent(price, iNav),
  };
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

export async function loadSingleStockBoard(fetchImpl: FetchLike = fetch, now = new Date()): Promise<SingleStockBoard> {
  // The shared session helper normally waits until 16:00; this view uses the
  // completed 15:30 close and fails closed while the source has not published it.
  const priceAsOf = minerviniSession(new Date(now.getTime() + 30 * 60_000));
  const clock = new Date(now.getTime() + 9 * 3_600_000);
  const today = clock.toISOString().slice(0, 10), minutes = clock.getUTCHours() * 60 + clock.getUTCMinutes();
  const live = minutes >= 9 * 60 && minutes < 15 * 60 + 30 && minerviniSession(new Date(`${today}T16:00:00+09:00`)) === today;
  const names = await Promise.all(singleStockNames.map((name) => loadName(fetchImpl, name, priceAsOf, live ? today : null, now)));
  return { asOf: now.toISOString(), names };
}

async function loadName(
  fetchImpl: FetchLike,
  spec: (typeof singleStockNames)[number],
  priceAsOf: string,
  liveDate: string | null,
  now: Date,
): Promise<SingleStockGroup> {
  const [underlying, ...products] = await Promise.all([
    liveDate ? loadLiveUnderlying(fetchImpl, spec.code, liveDate, priceAsOf, now) : loadUnderlying(fetchImpl, spec.code, priceAsOf),
    ...spec.products.map((product) => loadProduct(fetchImpl, product)),
  ]);
  return { code: spec.code, name: spec.name, ...underlying, priceAsOf: liveDate ?? priceAsOf, priceBasis: liveDate ? "KRX_REGULAR_LIVE" : "KRX_REGULAR_CLOSE", products };
}

async function loadLiveUnderlying(fetchImpl: FetchLike, code: string, today: string, previousDate: string, now: Date): Promise<{price: number | null; changePct: number | null; priceTime: string | null}> {
  try {
    const [payload, closes] = await Promise.all([
      getJson(fetchImpl, `https://stock.naver.com/api/domestic/detail/${code}/detail?codeType=KRX`),
      fetchKrxDailyCloses(code, previousDate, fetchImpl, 1),
    ]);
    const row = payload as Record<string, unknown>, stamp = String(row.tradeTime ?? "");
    const price = parseDecimal(row.nowPrice), previous = closes.at(-1)?.close;
    if (row.itemcode !== code || row.marketStatus !== "OPEN" || row.tradingSessionType !== "REGULAR_MARKET" || !/^\d{14}$/.test(stamp) || stamp.slice(0, 8) !== today.replaceAll("-", "") || stamp.slice(8, 12) < "0900" || stamp.slice(8, 12) >= "1530" || price == null || price <= 0) throw new Error("KRX 정규장 시세 확인 실패");
    const time = `${today}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}+09:00`;
    if (!Number.isFinite(Date.parse(time)) || Date.parse(time) > now.getTime() + 60_000) throw new Error("KRX 체결 시각 오류");
    return { price, changePct: previous != null && previous > 0 ? (price / previous - 1) * 100 : null, priceTime: time };
  } catch { return { price: null, changePct: null, priceTime: null }; }
}

async function loadUnderlying(fetchImpl: FetchLike, code: string, asOf: string): Promise<{price: number | null; changePct: number | null; priceTime: string | null}> {
  try {
    const closes = await fetchKrxDailyCloses(code, asOf, fetchImpl, 2);
    const price = closes.at(-1)?.close ?? null;
    const previousSession = minerviniSession(new Date(`${asOf}T15:59:00+09:00`));
    const previous = closes.at(-2)?.date === previousSession ? closes.at(-2)?.close ?? null : null;
    return { price, changePct: price != null && previous != null && previous > 0 ? (price / previous - 1) * 100 : null, priceTime: null };
  } catch {
    return { price: null, changePct: null, priceTime: null };
  }
}

async function loadProduct(fetchImpl: FetchLike, spec: SingleStockProduct): Promise<SingleStockCard> {
  const base = { code: spec.code, brand: spec.brand, product: spec.product, side: spec.side };
  try {
    const payload = await getJson(fetchImpl, `https://m.stock.naver.com/api/etf/${spec.code}/basic`);
    const quote = parseSingleStockEtf(payload);
    if (!quote) return { ...base, price: null, change: null, changePct: null, premium: null, error: "응답에 시세가 없습니다." };
    return { ...base, ...quote };
  } catch {
    return { ...base, price: null, change: null, changePct: null, premium: null, error: "조회에 실패했습니다." };
  }
}
