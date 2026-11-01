import { singleStockNames, type SingleStockProduct, type SingleStockSide } from "@/config/single-stock";
import { parseDecimal, parseNaverProxyQuote } from "@/lib/sources/proxy-board";

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
  changePct: number | null;
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
  const names = await Promise.all(singleStockNames.map((name) => loadName(fetchImpl, name, now)));
  return { asOf: now.toISOString(), names };
}

async function loadName(
  fetchImpl: FetchLike,
  spec: (typeof singleStockNames)[number],
  now: Date,
): Promise<SingleStockGroup> {
  const [changePct, ...products] = await Promise.all([
    loadUnderlying(fetchImpl, spec.code, now),
    ...spec.products.map((product) => loadProduct(fetchImpl, product)),
  ]);
  return { code: spec.code, name: spec.name, changePct, products };
}

async function loadUnderlying(fetchImpl: FetchLike, code: string, now: Date): Promise<number | null> {
  try {
    const payload = await getJson(fetchImpl, `https://m.stock.naver.com/api/stock/${code}/basic`);
    return parseNaverProxyQuote(payload, now)?.changePct ?? null;
  } catch {
    return null;
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
