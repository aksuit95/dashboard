import { KRW_CAP_FLOOR, USD_CAP_FLOOR, WEEK_HIGH_SESSIONS } from "@/config/universe";

export function moverExclusion(input: {
  marketCap: number | null;
  capCurrency: "KRW" | "USD";
  instrumentClass: string;
}): { excluded: boolean; reason: string | null } {
  const blocked = ["etf", "etn", "reit", "spac"];
  if (blocked.includes(input.instrumentClass)) {
    return { excluded: true, reason: input.instrumentClass.toUpperCase() };
  }
  if (input.marketCap == null || !Number.isFinite(input.marketCap)) {
    return { excluded: true, reason: "시총 미확인" };
  }
  const floor = input.capCurrency === "KRW" ? KRW_CAP_FLOOR : USD_CAP_FLOOR;
  if (input.marketCap < floor) {
    return { excluded: true, reason: "시가총액 기준 미달" };
  }
  return { excluded: false, reason: null };
}

export function trailingReturn(closes: number[], sessionsBack: number): number | null {
  if (sessionsBack <= 0 || closes.length <= sessionsBack) return null;
  const last = closes[closes.length - 1];
  const base = closes[closes.length - 1 - sessionsBack];
  if (!Number.isFinite(last) || !Number.isFinite(base) || base === 0) return null;
  return (last / base - 1) * 100;
}

/** 마지막 종가가 윈도우 최고가와 같으면 신고가. 윈도우가 252일보다 짧으면 shortWindow. */
export function fiftyTwoWeekHigh(closes: number[]): { high: boolean; sessions: number; shortWindow: boolean } | null {
  const usable = closes.filter((value) => Number.isFinite(value) && value > 0);
  if (usable.length < 2) return null;
  const window = usable.slice(-WEEK_HIGH_SESSIONS);
  const last = window[window.length - 1];
  const max = Math.max(...window);
  return {
    high: last >= max,
    sessions: window.length,
    shortWindow: window.length < WEEK_HIGH_SESSIONS,
  };
}
