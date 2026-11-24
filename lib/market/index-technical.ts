import { createIndexIndicators, mean, percentile, type Bollinger } from "./index-indicators";
import { calculateIndexLevels } from "./index-levels";
import { calculateIndexDisparities, defaultIndexRules, indexPercentileSampleMin, type IndexDisparityValue } from "./index-rules";
import { resampleIndexSessions, type IndexSession, type IndexTimeframe } from "./index-timeframe";
import type { IndexBar } from "@/lib/sources/index-bars";

export type { IndexSession } from "./index-timeframe";
export const movingAveragePeriods = [5, 20, 50, 60, 120, 200] as const;
export const indexReturnPeriods = [1, 5, 20, 60] as const;
export const chartRanges: Record<IndexTimeframe, readonly number[]> = { day: [20, 60, 120, 250], week: [13, 26, 52, 104], month: [12, 24, 36, 60] };
const trendPeriods = { day: [60, 120, 200], week: [10, 20, 40], month: [6, 12, 24] } as const;
const bandwidthWindows = { day: 252, week: 104, month: 36 };

type IndexIndicators = ReturnType<ReturnType<typeof createIndexIndicators>>;
export type IndexTechnicalPoint = IndexIndicators & {
  date: string;
  close: number | null;
  bar: IndexBar | null;
  averages: Record<number, number | null>;
  bands: Bollinger | null;
  incomplete: boolean;
  disparity: Record<number, IndexDisparityValue>;
};

const missingIndicators: IndexIndicators = { rsi: null, macd: null, atr: null, adx: null, stochastic: { k: null, d: null } };

export function indexChange(value: number | null | undefined, base: number | null | undefined) {
  return value == null || base == null || base === 0 ? null : (value / base - 1) * 100;
}

export function calculateIndexTechnical(daily: readonly IndexSession[], timeframe: IndexTimeframe = "day", rules = defaultIndexRules[timeframe]) {
  const sessions = resampleIndexSessions(daily, timeframe);
  const periods = timeframe === "day" ? [...movingAveragePeriods] : [...new Set([20, ...trendPeriods[timeframe]])];
  const closes: number[] = [];
  const eligible: IndexTechnicalPoint[] = [];
  const momentum = createIndexIndicators();
  const points = sessions.map(({ date, close, regular1530, bar, incomplete = false }): IndexTechnicalPoint => {
    const price = regular1530 ? close : null;
    const candle = price !== null && bar?.date === date && bar.close === price ? bar : null;
    const completed = regular1530 && !incomplete;
    if (completed) closes.push(price ?? NaN);
    const averages = Object.fromEntries(periods.map(period => {
      const average = completed && price !== null && closes.length >= period ? mean(closes.slice(-period)) : NaN;
      return [period, Number.isFinite(average) ? average : null];
    })) as IndexTechnicalPoint["averages"];

    const middle = averages[20];
    let bands: Bollinger | null = null;
    if (middle !== null) {
      const deviation = Math.sqrt(mean(closes.slice(-20).map(value => (value - middle) ** 2)));
      bands = { middle, upper: middle + 2 * deviation, lower: middle - 2 * deviation, width: 4 * deviation / middle * 100 };
    }
    const indicators = completed ? momentum(price, candle) : missingIndicators;
    const point = { date, close: price, bar: candle, averages, bands, incomplete, disparity: {}, ...indicators };
    if (completed) eligible.push(point);
    return point;
  });

  const latest = eligible.at(-1);
  if (latest?.close == null) return null;
  const chartLatest = points.at(-1)!;
  for (const item of calculateIndexDisparities(eligible, rules, indexPercentileSampleMin(timeframe, rules.pctlLookback))) {
    item.points.forEach((point, i) => { eligible[i].disparity[item.period] = point; });
  }
  const earlier = eligible.slice(0, -1);
  const bandwidthWindow = bandwidthWindows[timeframe];
  const bandwidthSample = earlier.slice(-bandwidthWindow).flatMap(p => p.bands ? [p.bands.width] : []).sort((a, b) => a - b);
  const bandwidthThreshold = bandwidthSample.length < bandwidthWindow / 2 ? null : percentile(bandwidthSample, 0.1);
  const lastIndex = points.indexOf(latest);

  return {
    points,
    completed: eligible,
    latest, chartLatest,
    levels: calculateIndexLevels(eligible, chartLatest.close ?? latest.close, rules,
      daily.slice(-65).filter(item => item.regular1530 && !item.incomplete).map(item => ({ ...item, bar: item.bar ?? null }))),
    returns: indexReturnPeriods.map(period => indexChange(latest.close, points[lastIndex - period]?.close)),
    disparities: rules.maPeriods.map(period => ({ period, ...latest.disparity[period] })),
    bandwidthThreshold,
    trendPeriods: trendPeriods[timeframe],
  };
}

export type IndexTechnicalAnalysis = NonNullable<ReturnType<typeof calculateIndexTechnical>>;

export function summarizeIndexTrend(latest: IndexTechnicalPoint, breadth: number | null, timeframe: IndexTimeframe = "day") {
  const [shortPeriod, mediumPeriod, longPeriod] = trendPeriods[timeframe];
  const short = latest.averages[shortPeriod];
  const medium = latest.averages[mediumPeriod];
  const long = latest.averages[longPeriod];
  const unit = timeframe === "day" ? "일" : "봉";
  const periodLabel = `${shortPeriod}·${mediumPeriod}·${longPeriod}${unit}선`;
  const alignment = short === null || medium === null || long === null ? null :
    short > medium && medium > long ? 1 : short < medium && medium < long ? -1 : 0;
  const histogram = latest.macd?.histogram ?? null;
  const factors = [
    { label: `종가 / ${mediumPeriod}${unit}선`, value: latest.close === null || medium === null ? null : Math.sign(latest.close - medium) },
    { label: `${periodLabel} 배열`, value: alignment },
    { label: "MACD 히스토그램", value: histogram === null ? null : Math.sign(histogram) },
    { label: "20일선 위 종목 비율", value: breadth === null ? null : breadth >= 55 ? 1 : breadth <= 45 ? -1 : 0 },
  ];
  const available = factors.filter(factor => factor.value !== null);
  const score = available.reduce((total, factor) => total + factor.value!, 0);
  const max = available.length;
  const status = max < 3 ? "판단 보류" : score / max >= 0.5 ? "강세" : score / max <= -0.5 ? "약세" : "중립";
  return { alignment, periodLabel, factors, score, max, status };
}
