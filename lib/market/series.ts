export type BreadthDay = {
  advancers: number;
  decliners: number;
  unchanged: number;
};

/** 최근 window 거래일의 상승 종목 수 합 / 하락 종목 수 합 × 100. 보합은 사용하지 않는다. */
export function adrRatio(days: BreadthDay[], window = 20): number | null {
  if (days.length < window) return null;
  const slice = days.slice(-window);
  let up = 0;
  let down = 0;
  for (const day of slice) {
    if (!Number.isFinite(day.advancers) || !Number.isFinite(day.decliners)) return null;
    if (day.advancers < 0 || day.decliners < 0) return null;
    up += day.advancers;
    down += day.decliners;
  }
  if (down === 0) return null;
  return (up / down) * 100;
}

/** 이격도 = 마지막 종가 / N일 단순이동평균 × 100. 표본이 부족하면 null. */
export function disparity(closes: number[], window: number): number | null {
  if (window <= 0 || closes.length < window) return null;
  const slice = closes.slice(-window);
  if (slice.some((value) => !Number.isFinite(value))) return null;
  const average = slice.reduce((sum, value) => sum + value, 0) / window;
  if (average === 0) return null;
  return (slice[slice.length - 1] / average) * 100;
}

export function disparitySeries(
  bars: { date: string; close: number }[],
  window: number,
): { date: string; value: number }[] {
  const points: { date: string; value: number }[] = [];
  for (let index = window - 1; index < bars.length; index += 1) {
    const value = disparity(
      bars.slice(index - window + 1, index + 1).map((bar) => bar.close),
      window,
    );
    if (value != null) points.push({ date: bars[index].date, value });
  }
  return points;
}

/** (당일 좌수 - 전일 좌수) × 당일 NAV. NAV 가 없으면 계산하지 않는다. */
export function etfNetFlow(
  previousShares: number | null,
  shares: number | null,
  nav: number | null,
): number | null {
  if (previousShares == null || shares == null || nav == null) return null;
  if (!Number.isFinite(previousShares) || !Number.isFinite(shares) || !Number.isFinite(nav)) return null;
  return (shares - previousShares) * nav;
}

export function marketCapRatio(numerators: number[], denominators: number[]): number | null {
  if (!numerators.length || !denominators.length) return null;
  if (numerators.some((value) => !Number.isFinite(value)) || denominators.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const denominator = denominators.reduce((sum, value) => sum + value, 0);
  if (denominator === 0) return null;
  const numerator = numerators.reduce((sum, value) => sum + value, 0);
  return (numerator / denominator) * 100;
}

export type AnnualReturn = {
  year: number;
  returnPct: number;
  ytd: boolean;
};

/**
 * 배당을 제외한 가격 수익률.
 * 연간 수익률 = 그해 마지막 종가 / 직전 연도 마지막 종가 - 1.
 * 직전 연도 종가가 없으면 그해는 건너뛴다. 데이터의 마지막 해가 12월 말이 아니면 YTD.
 */
export function annualPriceReturns(bars: { date: string; close: number }[]): AnnualReturn[] {
  const sorted = [...bars]
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const byYear = new Map<number, { date: string; close: number }[]>();
  for (const bar of sorted) {
    const year = Number(bar.date.slice(0, 4));
    const list = byYear.get(year) ?? [];
    list.push(bar);
    byYear.set(year, list);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const lastDate = sorted.at(-1)?.date ?? "";
  const latestYear = lastDate ? Number(lastDate.slice(0, 4)) : null;
  const results: AnnualReturn[] = [];
  for (let index = 1; index < years.length; index += 1) {
    const year = years[index];
    if (years[index - 1] !== year - 1) continue;
    const previous = byYear.get(year - 1);
    const current = byYear.get(year);
    if (!previous?.length || !current?.length) continue;
    const base = previous[previous.length - 1].close;
    const last = current[current.length - 1].close;
    if (base === 0) continue;
    results.push({
      year,
      returnPct: (last / base - 1) * 100,
      ytd: year === latestYear && lastDate.slice(5) < "12-28",
    });
  }
  return results;
}

export type RangeKey = "6M" | "1Y" | "3Y" | "5Y";

const RANGE_DAYS: Record<RangeKey, number> = {
  "6M": 183,
  "1Y": 365,
  "3Y": 365 * 3,
  "5Y": 365 * 5,
};

export function sliceByRange<T extends { date: string }>(points: T[], range: RangeKey): T[] {
  if (!points.length) return [];
  const end = points[points.length - 1].date;
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const startMs = endMs - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return points.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= startMs);
}

export type HoldingRow = {
  symbol: string;
  name: string;
  weight: number;
};

/** 스냅샷이 2일치 미만이면 null. 비중 차이는 퍼센트 포인트. */
export function holdingWeightChanges(
  older: HoldingRow[] | null,
  newer: HoldingRow[] | null,
): { symbol: string; name: string; previous: number; current: number; delta: number }[] | null {
  if (!older?.length || !newer?.length) return null;
  const previous = new Map(older.map((row) => [row.symbol, row]));
  const symbols = new Set<string>([...older.map((row) => row.symbol), ...newer.map((row) => row.symbol)]);
  return [...symbols]
    .map((symbol) => {
      const before = previous.get(symbol);
      const after = newer.find((row) => row.symbol === symbol);
      const prevWeight = before?.weight ?? 0;
      const nextWeight = after?.weight ?? 0;
      return {
        symbol,
        name: after?.name || before?.name || symbol,
        previous: prevWeight,
        current: nextWeight,
        delta: nextWeight - prevWeight,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** 섹터 YoY 는 종목 YoY 의 평균이 아니라 매출 합의 YoY. */
export function revenueYoy(currentTotal: number | null, priorTotal: number | null): number | null {
  if (currentTotal == null || priorTotal == null) return null;
  if (!Number.isFinite(currentTotal) || !Number.isFinite(priorTotal) || priorTotal === 0) return null;
  return (currentTotal / priorTotal - 1) * 100;
}

export function sum(values: number[]): number | null {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0);
}
