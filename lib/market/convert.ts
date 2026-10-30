import type { ReceiptEvent } from "@/config/universe";

export type FxRates = {
  usdkrw: number | null;
  eurkrw: number | null;
  usdjpy: number | null;
};

export function sharesPerReceiptOn(
  schedule: ReceiptEvent[] | undefined,
  onDate: string,
  fallback: number,
): number {
  if (!schedule?.length) return fallback;
  const applicable = schedule
    .filter((event) => event.effective <= onDate)
    .sort((a, b) => a.effective.localeCompare(b.effective));
  if (!applicable.length) return fallback;
  return applicable[applicable.length - 1].sharesPerReceipt;
}

/** 상장 가격을 보통주 1주 원화로 환산한다. sharesPerReceipt 가 0 이하이거나 환율이 없으면 null. */
export function perShareKrw(
  listedPrice: number,
  fxKrwPerQuotedCurrency: number,
  sharesPerReceipt: number,
): number | null {
  if (!Number.isFinite(listedPrice) || !Number.isFinite(fxKrwPerQuotedCurrency) || !Number.isFinite(sharesPerReceipt)) {
    return null;
  }
  if (sharesPerReceipt <= 0 || fxKrwPerQuotedCurrency <= 0) return null;
  return (listedPrice * fxKrwPerQuotedCurrency) / sharesPerReceipt;
}

/** 같은 단위의 두 가격 프리미엄(%). 기준가가 0이거나 없으면 null. */
export function premiumPercent(price: number | null, base: number | null): number | null {
  if (price == null || base == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(base) || base === 0) return null;
  return (price / base - 1) * 100;
}

export function changePercent(price: number | null, previous: number | null): number | null {
  if (price == null || previous == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(previous) || previous === 0) return null;
  return (price / previous - 1) * 100;
}

/** Hyperliquid info API 의 funding 은 시간당 비율이다. */
export function funding8hPercent(hourlyRate: number | null): number | null {
  if (hourlyRate == null || !Number.isFinite(hourlyRate)) return null;
  return hourlyRate * 8 * 100;
}

export function toUsd(amount: number | null, currency: string, fx: FxRates): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  if (currency === "USD") return amount;
  if (currency === "KRW") {
    if (fx.usdkrw == null || fx.usdkrw <= 0) return null;
    return amount / fx.usdkrw;
  }
  if (currency === "EUR") {
    if (fx.eurkrw == null || fx.usdkrw == null || fx.eurkrw <= 0 || fx.usdkrw <= 0) return null;
    return (amount * fx.eurkrw) / fx.usdkrw;
  }
  if (currency === "JPY") {
    if (fx.usdjpy == null || fx.usdjpy <= 0) return null;
    return amount / fx.usdjpy;
  }
  return null;
}

export function fxForCurrency(currency: string, fx: FxRates): number | null {
  if (currency === "KRW" || currency === "POINTS" || currency === "PERCENT") return 1;
  if (currency === "USD") return fx.usdkrw;
  if (currency === "EUR") return fx.eurkrw;
  if (currency === "JPY") return fx.usdjpy;
  return null;
}

export function isQuoteStale(input: {
  fetchedAt: string | null;
  now: string;
  intervalMs: number;
  failed: boolean;
}): boolean {
  if (input.failed) return true;
  if (!input.fetchedAt) return true;
  const age = Date.parse(input.now) - Date.parse(input.fetchedAt);
  if (!Number.isFinite(age)) return true;
  return age > input.intervalMs * 3;
}
