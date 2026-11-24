export const radarPeriods = { "1m": 21, "3m": 63, "52w": 252 } as const;
export type RadarPeriod = keyof typeof radarPeriods;
export type RadarMarket = "KOSPI" | "KOSDAQ";
export type RadarTab = "high" | "low" | "drawdown";
export const radarThresholds = [-20, -30, -40] as const;
export const radarPriceBasis = "KRX_REGULAR_CLOSE_1530";

export type RadarPoint = { date: string; price: number };
export type RadarMetrics = {
  priorHigh: RadarPoint;
  priorLow: RadarPoint;
  breakoutPct: number | null;
  breakdownPct: number | null;
  currentPeak: RadarPoint;
  currentDrawdownPct: number;
  mddPct: number;
  mddPeak: RadarPoint;
  mddTrough: RadarPoint;
};
export type RadarRow = {
  code: string;
  name: string;
  market: RadarMarket;
  close: number | null;
  marketCap: number | null;
  turnover: number | null;
  metrics: Record<RadarPeriod, RadarMetrics | null>;
};
export type RadarSeries = { prices: number[]; adjustedFrom: string | null };
export type RadarAboveSma20 = Record<RadarMarket, { above: number; eligible: number }>;
export type RadarSnapshot = {
  version: 1 | 2;
  exchange: "KRX";
  priceBasis: typeof radarPriceBasis;
  priceTime: "15:30 KST";
  asOf: string;
  fetchedAt: string;
  universeAsOf: string;
  source: "KRX_OPEN_API" | "KRX_WEB_VERIFIED" | "NAVER_KRX_CLOSE";
  dates: string[];
  rows: RadarRow[];
  series: Record<string, RadarSeries>;
  aboveSma20?: RadarAboveSma20;
};
const pct = (price: number, reference: number) => (price - reference) / reference * 100;

/** Points cover the preceding N eligible sessions and the reference session. */
export function calculateRadarMetrics(points: RadarPoint[], preceding: number): RadarMetrics | null {
  if (points.length < preceding + 1) return null;
  const window = points.slice(-preceding - 1);
  const current = window.at(-1)!;
  let priorHigh = window[0], priorLow = window[0], peak = window[0];
  let mddPct = 0, mddPeak = peak, mddTrough = peak;

  for (let i = 1; i < window.length; i++) {
    const point = window[i];
    if (i < window.length - 1) {
      if (point.price >= priorHigh.price) priorHigh = point;
      if (point.price <= priorLow.price) priorLow = point;
    }
    if (point.price >= peak.price) peak = point;
    const drawdown = pct(point.price, peak.price);
    if (drawdown < mddPct) {
      mddPct = drawdown;
      mddPeak = peak;
      mddTrough = point;
    }
  }

  return {
    priorHigh, priorLow,
    breakoutPct: current.price > priorHigh.price ? pct(current.price, priorHigh.price) : null,
    breakdownPct: current.price < priorLow.price ? pct(current.price, priorLow.price) : null,
    currentPeak: peak, currentDrawdownPct: pct(current.price, peak.price), mddPct, mddPeak, mddTrough,
  };
}

export function radarSignal(metrics: RadarMetrics | null, tab: RadarTab, threshold: number): number | null {
  if (!metrics) return null;
  if (tab === "high") return metrics.breakoutPct;
  if (tab === "low") return metrics.breakdownPct;
  return metrics.currentDrawdownPct <= threshold ? metrics.currentDrawdownPct : null;
}
