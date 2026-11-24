import { mean, percentile } from "./index-indicators";
import { clusterIndexPivots, detectIndexPivots } from "./index-levels";
import type { IndexRules } from "./index-rules";
import { indexChange, type IndexTechnicalPoint } from "./index-technical";
import type { IndexTimeframe } from "./index-timeframe";

export const indexEventLabels = {
  "disparity-low": "이격도 하위 구간 진입", "disparity-high": "이격도 상위 구간 진입",
  "rsi-low": "RSI 과매도 진입", "rsi-high": "RSI 과매수 진입",
  "support-near": "지지선 근접", "resistance-near": "저항선 근접",
} as const;
export type IndexEventType = keyof typeof indexEventLabels;
export const indexEventTypes = Object.keys(indexEventLabels) as IndexEventType[];
export type IndexHorizons = [number, number, number];
export type IndexBacktestSettings = {
  event: IndexEventType;
  maSlot: number;
  rsiUpper: number;
  rsiLower: number;
  proximityPct: number;
  cooldownBars: number;
  horizons: IndexHorizons;
};
type ComparisonSettings = Omit<IndexBacktestSettings, "event">;

const defaults = { event: "disparity-low", maSlot: 0, rsiUpper: 70, rsiLower: 30, proximityPct: 1 } as const;
export const indexBacktestDefaults: Record<IndexTimeframe, IndexBacktestSettings> = {
  day: { ...defaults, cooldownBars: 5, horizons: [5, 20, 60] },
  week: { ...defaults, cooldownBars: 1, horizons: [1, 4, 12] },
  month: { ...defaults, cooldownBars: 1, horizons: [1, 3, 6] },
};

type EventPoint = Pick<IndexTechnicalPoint, "date" | "close" | "bar" | "disparity" | "rsi">;
type EventState = boolean | null;

/** An unknown previous state cannot establish a first entry. */
export function indexFirstEntries(states: readonly EventState[], cooldownBars: number) {
  const entries: number[] = [];
  for (let i = 1; i < states.length; i++) {
    if (states[i - 1] !== false || states[i] !== true) continue;
    const last = entries.at(-1);
    if (last === undefined || i - last > cooldownBars) entries.push(i);
  }
  return entries;
}

export function indexEventStates(points: readonly EventPoint[], rules: IndexRules, settings: IndexBacktestSettings): EventState[] {
  const { event } = settings;
  if (event === "disparity-low" || event === "disparity-high") {
    const period = rules.maPeriods[settings.maSlot];
    const expected = event === "disparity-low" ? "침체" : "과열";
    return points.map(point => {
      const disparity = point.disparity[period];
      return !disparity || disparity.status === "미확인" ? null : disparity.status === expected;
    });
  }
  if (event === "rsi-low" || event === "rsi-high") return points.map(point => point.rsi === null ? null :
    event === "rsi-low" ? point.rsi <= settings.rsiLower : point.rsi >= settings.rsiUpper);

  return indexProximityStates(points, rules, settings.proximityPct)[event];
}

function indexProximityStates(points: readonly EventPoint[], rules: IndexRules, proximityPct: number) {
  const pivots = detectIndexPivots(points, rules.swingN);
  const support: EventState[] = [];
  const resistance: EventState[] = [];
  points.forEach((point, i) => {
    const prior = points[i - 1];
    const close = point.close;
    if (!prior || prior.close === null || close === null) {
      support.push(null);
      resistance.push(null);
      return;
    }
    // Match A's rolling window and use only the levels known at the previous close.
    const first = Math.max(0, i - rules.lookbackBars);
    const window = pivots.filter(pivot => pivot.index - rules.swingN >= first && pivot.index + rules.swingN < i);
    const levels = clusterIndexPivots(window, prior.close, rules, prior.date);
    const near = (side: "support" | "resistance") => {
      const prices = levels.filter(level => level.side === side);
      return prices.length ? prices.some(level => Math.abs(indexChange(close, level.price)!) <= proximityPct) : null;
    };
    support.push(near("support"));
    resistance.push(near("resistance"));
  });
  return { "support-near": support, "resistance-near": resistance };
}

type ReturnObservation = { index: number; value: number };

function returnSummary(observations: ReturnObservation[]) {
  const values = observations.map(item => item.value).sort((a, b) => a - b);
  const count = values.length;
  return count ? {
    count, average: mean(values), median: percentile(values, 0.5),
    winRate: values.filter(value => value > 0).length / count * 100,
    p25: percentile(values, 0.25), p75: percentile(values, 0.75), min: values[0], max: values[count - 1],
  } : null;
}

export function indexReturnHistogram(signal: readonly number[], baseline: readonly number[]) {
  if (!signal.length && !baseline.length) return [];
  const extreme = [...signal, ...baseline].reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const bound = extreme > 0 ? extreme : 1;
  const size = 16;
  const width = 2 * bound / size;
  const bins = Array.from({ length: size }, (_, i) => ({ lower: -bound + i * width, upper: -bound + (i + 1) * width, signal: 0, baseline: 0 }));
  const index = (value: number) => Math.min(size - 1, Math.max(0, Math.floor((value + bound) / width)));
  for (const value of signal) bins[index(value)].signal++;
  for (const value of baseline) bins[index(value)].baseline++;
  return bins;
}

function backtestFromStates(points: readonly EventPoint[], states: readonly EventState[], settings: ComparisonSettings) {
  const entries = indexFirstEntries(states, settings.cooldownBars);
  const entrySet = new Set(entries);
  const first = states.findIndex((state, i) => i > 0 && state !== null && states[i - 1] !== null);
  const events = entries.map(index => ({ date: points[index].date }));
  const horizons = settings.horizons.map(horizon => {
    const baseline: ReturnObservation[] = [];
    if (first >= 0) for (let i = first; i + horizon < points.length; i++) {
      const value = indexChange(points[i + horizon].close, points[i].close);
      if (value !== null) baseline.push({ index: i, value });
    }
    const signal = baseline.filter(item => entrySet.has(item.index));
    const overlap = signal.some((item, i) => i > 0 && item.index - signal[i - 1].index < horizon);
    return {
      horizon, signal: returnSummary(signal), baseline: returnSummary(baseline), overlap,
      start: baseline.length ? points[baseline[0].index].date : null,
      end: baseline.length ? points[baseline.at(-1)!.index].date : null,
      bins: indexReturnHistogram(signal.map(item => item.value), baseline.map(item => item.value)),
    };
  });
  return { events, horizons, start: first >= 0 ? points[first].date : null, end: points.at(-1)?.date ?? null };
}

/** Points contain completed KRX 15:30 slots, including any regular-session gaps. */
export function calculateIndexBacktest(points: readonly EventPoint[], rules: IndexRules, settings: IndexBacktestSettings) {
  return backtestFromStates(points, indexEventStates(points, rules, settings), settings);
}

export type IndexBacktest = ReturnType<typeof calculateIndexBacktest>;
export type IndexBacktests = Record<IndexEventType, IndexBacktest>;

export function calculateIndexBacktests(points: readonly EventPoint[], rules: IndexRules, settings: ComparisonSettings): IndexBacktests {
  const proximity = indexProximityStates(points, rules, settings.proximityPct);
  return Object.fromEntries(indexEventTypes.map(event => {
    const states = event === "support-near" || event === "resistance-near" ? proximity[event] : indexEventStates(points, rules, { ...settings, event });
    return [event, backtestFromStates(points, states, settings)];
  })) as IndexBacktests;
}
