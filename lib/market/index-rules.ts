import { mean, percentile } from "./index-indicators";
import { indexTimeframes, type IndexTimeframe } from "./index-timeframe";

export type IndexRules = {
  swingN: number;
  clusterTolPct: number;
  minTouches: number;
  lookbackBars: number;
  maxLevels: number;
  maPeriods: [number, number, number];
  pctlUpper: number;
  pctlLower: number;
  pctlLookback: number | "all";
  expanding: boolean;
  calibrationEnd: string | null;
};

const shared = { clusterTolPct: 0.75, minTouches: 2, maxLevels: 2, pctlUpper: 95, pctlLower: 5, expanding: true, calibrationEnd: null };
export const defaultIndexRules: Record<IndexTimeframe, IndexRules> = {
  day: { ...shared, swingN: 5, lookbackBars: 120, maPeriods: [20, 60, 120], pctlLookback: 756 },
  week: { ...shared, swingN: 3, lookbackBars: 52, maPeriods: [10, 20, 40], pctlLookback: "all" },
  month: { ...shared, swingN: 2, lookbackBars: 36, maPeriods: [6, 12, 24], pctlLookback: "all" },
};
export const minPercentileSamples: Record<IndexTimeframe, number> = { day: 252, week: 52, month: 12 };
export function indexPercentileSampleMin(timeframe: IndexTimeframe, lookback: IndexRules["pctlLookback"]) {
  return lookback === "all" ? minPercentileSamples[timeframe] : Math.min(minPercentileSamples[timeframe], lookback);
}
export const indexRuleLimits = {
  swingN: [1, 20], clusterTolPct: [0, 10], minTouches: [1, 20], lookbackBars: [5, 1500], maxLevels: [1, 8],
  ma: [2, 300], pctlUpper: [50, 100], pctlLower: [0, 50], pctlLookback: [12, 2000],
} as const;

export type IndexSettings = { timeframe: IndexTimeframe; rules: Record<IndexTimeframe, IndexRules> };

export function validIndexRuleNumber(value: unknown, limits: readonly [number, number], integer = true): value is number {
  return typeof value === "number" && Number.isFinite(value) && (!integer || Number.isInteger(value)) && value >= limits[0] && value <= limits[1];
}

export function restoreIndexSettings(raw: unknown): IndexSettings {
  const candidate = raw as Partial<IndexSettings> | null;
  const rules = { ...defaultIndexRules };
  for (const timeframe of indexTimeframes) {
    const saved = candidate?.rules?.[timeframe];
    if (saved && validIndexRuleNumber(saved.swingN, indexRuleLimits.swingN) && validIndexRuleNumber(saved.clusterTolPct, indexRuleLimits.clusterTolPct, false) &&
      validIndexRuleNumber(saved.minTouches, indexRuleLimits.minTouches) && validIndexRuleNumber(saved.lookbackBars, [saved.swingN * 2 + 1, indexRuleLimits.lookbackBars[1]]) &&
      validIndexRuleNumber(saved.maxLevels, indexRuleLimits.maxLevels) && Array.isArray(saved.maPeriods) && saved.maPeriods.length === 3 &&
      saved.maPeriods.every((period, i) => validIndexRuleNumber(period, indexRuleLimits.ma) && (i === 0 || saved.maPeriods[i - 1] < period)) &&
      validIndexRuleNumber(saved.pctlUpper, indexRuleLimits.pctlUpper, false) && validIndexRuleNumber(saved.pctlLower, indexRuleLimits.pctlLower, false) && saved.pctlLower < saved.pctlUpper &&
      (saved.pctlLookback === "all" || validIndexRuleNumber(saved.pctlLookback, indexRuleLimits.pctlLookback)) &&
      typeof saved.expanding === "boolean" && (saved.calibrationEnd === null || /^\d{4}-\d{2}-\d{2}$/.test(saved.calibrationEnd))) rules[timeframe] = saved;
  }
  return { timeframe: candidate?.timeframe && indexTimeframes.includes(candidate.timeframe) ? candidate.timeframe : "day", rules };
}

export type IndexDisparityRow = { date: string; close: number | null };
export type DisparityThreshold = { lower: number; upper: number; samples: number };
export type IndexDisparityValue = { value: number | null; reference: DisparityThreshold | null; rank: number | null; status: "과열" | "침체" | "중립" | "미확인" };

function bounds(sorted: number[], value: number, inclusive: boolean) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid] < value || (inclusive && sorted[mid] === value)) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function calculateIndexDisparities(rows: readonly IndexDisparityRow[], rules: IndexRules, minSamples: number) {
  const closes = rows.map(row => row.close ?? NaN);
  return rules.maPeriods.map(period => {
    const values = closes.map((close, i) => {
      const avg = i + 1 >= period ? mean(closes.slice(i - period + 1, i + 1)) : NaN;
      return Number.isFinite(avg) && avg > 0 ? close / avg * 100 : null;
    });
    const calibrationEnd = rules.calibrationEnd;
    const fixedRows = calibrationEnd === null ? [] : values.slice(0, rows.findLastIndex(row => row.date <= calibrationEnd) + 1);
    const fixed = (rules.pctlLookback === "all" ? fixedRows : fixedRows.slice(-rules.pctlLookback))
      .filter(value => value !== null).sort((a, b) => a - b);
    const past: number[] = [];
    const points = values.map((value, i): IndexDisparityValue => {
      const sample = rules.expanding ? past : calibrationEnd !== null && rows[i].date > calibrationEnd ? fixed : [];
      const reference = sample.length >= minSamples ? {
        lower: percentile(sample, rules.pctlLower / 100), upper: percentile(sample, rules.pctlUpper / 100), samples: sample.length,
      } : null;
      const rank = value === null || !reference ? null : (bounds(sample, value, false) + bounds(sample, value, true)) / (2 * sample.length) * 100;
      const status = value === null || !reference ? "미확인" : reference.lower === reference.upper && value === reference.lower ? "중립" :
        value >= reference.upper ? "과열" : value <= reference.lower ? "침체" : "중립";
      if (rules.expanding) {
        if (value !== null) past.splice(bounds(past, value, false), 0, value);
        if (typeof rules.pctlLookback === "number" && i >= rules.pctlLookback) {
          const expired = values[i - rules.pctlLookback];
          if (expired !== null) past.splice(bounds(past, expired, false), 1);
        }
      }
      return { value, reference, rank, status };
    });
    return { period, points };
  });
}
