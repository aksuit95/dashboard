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
  priceNotice?: string;
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
  const clock = new Date(now.getTime() + 9 * 3_600_000);
  const today = clock.toISOString().slice(0, 10), minutes = clock.getUTCHours() * 60 + clock.getUTCMinutes();
  // KRX: https://kind.krx.co.kr/external/2026/11/05/000141/20261105000216/99303.htm
  // The 2026-11-19 CSAT session is 10:00–16:30. Its 16:30
  // close cannot be represented as a 15:30 close under the dashboard contract.
  const special = today === "2026-11-19";
  let priceAsOf = today, live = false, unavailable = false, previousAvailable = true;
  try {
    if (special) {
      priceAsOf = minerviniSession(new Date(`${today}T15:59:00+09:00`));
      live = minutes >= 10 * 60 && minutes < 16 * 60 + 30;
      unavailable = minutes >= 16 * 60 + 30;
      if (unavailable) priceAsOf = today;
    } else {
      priceAsOf = minerviniSession(new Date(now.getTime() + 30 * 60_000));
      live = minutes >= 9 * 60 && minutes < 15 * 60 + 30 && minerviniSession(new Date(`${today}T16:00:00+09:00`)) === today;
    }
  } catch {
    // A missing previous 15:30 close must not block a verified regular live
    // quote or independent ETF quotes. Do not calculate against another close.
    previousAvailable = false;
    try { live = minutes >= 9 * 60 && minutes < 15 * 60 + 30 && minerviniSession(new Date(`${today}T16:00:00+09:00`)) === today; } catch { live = false; }
    unavailable = !live;
  }
  const names = await Promise.all(singleStockNames.map((name) => loadName(fetchImpl, name, priceAsOf, live ? today : null, now, unavailable, previousAvailable, special ? "1630" : "1530")));
  return { asOf: now.toISOString(), names };
}

async function loadName(
  fetchImpl: FetchLike,
  spec: (typeof singleStockNames)[number],
  priceAsOf: string,
  liveDate: string | null,
  now: Date,
  unavailable: boolean,
  previousAvailable: boolean,
  liveEnd: string,
): Promise<SingleStockGroup> {
  const [underlying, ...products] = await Promise.all([
    unavailable ? Promise.resolve({ price: null, changePct: null, priceTime: null }) : liveDate ? loadLiveUnderlying(fetchImpl, spec.code, liveDate, previousAvailable ? priceAsOf : null, now, liveEnd) : loadUnderlying(fetchImpl, spec.code, priceAsOf),
    ...spec.products.map((product) => loadProduct(fetchImpl, product)),
  ]);
  return { code: spec.code, name: spec.name, ...underlying, priceAsOf: liveDate ?? priceAsOf, priceBasis: liveDate ? "KRX_REGULAR_LIVE" : "KRX_REGULAR_CLOSE", ...(unavailable ? {priceNotice:"KRX 15:30 기준 가격을 확인할 수 없습니다."} : !previousAvailable ? {priceNotice:"직전 거래일의 KRX 15:30 기준 가격이 없어 등락률을 표시하지 않습니다."} : {}), products };
}

async function loadLiveUnderlying(fetchImpl: FetchLike, code: string, today: string, previousDate: string | null, now: Date, liveEnd: string): Promise<{price: number | null; changePct: number | null; priceTime: string | null}> {
  try {
    const [payload, closes] = await Promise.all([
      getJson(fetchImpl, `https://stock.naver.com/api/domestic/detail/${code}/detail?codeType=KRX`),
      previousDate ? fetchKrxDailyCloses(code, previousDate, fetchImpl, 1) : Promise.resolve([]),
    ]);
    const row = payload as Record<string, unknown>, stamp = String(row.tradeTime ?? "");
    const price = parseDecimal(row.nowPrice), previous = closes.at(-1)?.close;
    if (row.itemcode !== code || row.marketStatus !== "OPEN" || row.tradingSessionType !== "REGULAR_MARKET" || !/^\d{14}$/.test(stamp) || stamp.slice(0, 8) !== today.replaceAll("-", "") || stamp.slice(8, 12) < (liveEnd === "1630" ? "1000" : "0900") || stamp.slice(8, 12) >= liveEnd || price == null || price <= 0) throw new Error("KRX 정규장 시세 확인 실패");
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
