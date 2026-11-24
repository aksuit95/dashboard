import { mean } from "./index-indicators";
import { defaultIndexRules, type IndexRules } from "./index-rules";
import type { IndexBar } from "@/lib/sources/index-bars";

type LevelPoint = { date: string; close: number | null; bar: IndexBar | null };
export type IndexPivot = { date: string; price: number; index: number; kind: "high" | "low"; confirmedAt: string | null };
export type SwingLevel = { price: number; touches: number; side: "support" | "resistance"; lastTouch: string };

export function detectIndexPivots(points: readonly LevelPoint[], width: number, allowCloseFallback = false) {
  const pivots: IndexPivot[] = [];
  for (let i = width; i < points.length; i++) {
    const window = points.slice(i - width, i + width + 1);
    for (const kind of ["high", "low"] as const) {
      const values = window.map(point => point.bar?.[kind] ?? (allowCloseFallback ? point.close : null));
      if (values.some(value => value === null)) continue;
      const price = values[width]!;
      const exceeds = values.every((value, index) => index === width || (kind === "high" ? price > value! : price < value!));
      if (exceeds) pivots.push({ date: points[i].date, index: i, price, kind, confirmedAt: points[i + width]?.date ?? null });
    }
  }
  return pivots;
}

export function clusterIndexPivots(pivots: readonly IndexPivot[], close: number, rules: IndexRules, asOf: string) {
  const confirmed = pivots.filter(pivot => pivot.confirmedAt !== null && pivot.confirmedAt <= asOf).sort((a, b) => a.price - b.price);
  const groups: IndexPivot[][] = [];
  for (const pivot of confirmed) {
    const group = groups.at(-1);
    if (group && pivot.price <= group[0].price * (1 + rules.clusterTolPct / 100)) group.push(pivot);
    else groups.push([pivot]);
  }
  const levels: SwingLevel[] = groups.flatMap(group => {
    const dates = [...new Set(group.map(pivot => pivot.date))].sort();
    if (dates.length < rules.minTouches) return [];
    const price = mean(group.map(pivot => pivot.price));
    return [{ price, touches: dates.length, side: price <= close ? "support" : "resistance", lastTouch: dates.at(-1)! }];
  });
  const select = (side: SwingLevel["side"]) => levels.filter(level => level.side === side)
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close) || b.touches - a.touches).slice(0, rules.maxLevels);
  return [...select("support"), ...select("resistance")];
}

function fibonacciWave(pivots: IndexPivot[], length: number) {
  const recent = pivots.filter(pivot => pivot.confirmedAt !== null && pivot.index >= length - 60);
  const alternating: IndexPivot[] = [];
  for (const pivot of recent) {
    const previous = alternating.at(-1);
    if (!previous || previous.kind !== pivot.kind) alternating.push(pivot);
    else if (pivot.kind === "high" ? pivot.price > previous.price : pivot.price < previous.price) alternating[alternating.length - 1] = pivot;
  }
  let wave: { first: IndexPivot; last: IndexPivot; size: number } | null = null;
  for (let i = 1; i < alternating.length; i++) {
    const first = alternating[i - 1];
    const last = alternating[i];
    const size = Math.abs(last.price / first.price - 1);
    if (last.index - first.index >= 5 && size >= 0.03 && (!wave || size >= wave.size)) wave = { first, last, size };
  }
  if (!wave) return null;
  const { first, last } = wave;
  return { first, last, levels: [38.2, 50, 61.8].map(ratio => ({ ratio, price: last.price + (first.price - last.price) * ratio / 100 })) };
}

function volumeProfile(points: LevelPoint[]) {
  const recent = points.slice(-60);
  if (recent.length !== 60 || !recent.every(point => point.bar !== null)) return null;
  const bars = recent.map(point => point.bar!);
  const low = Math.min(...bars.map(bar => bar.close));
  const high = Math.max(...bars.map(bar => bar.close));
  const count = high === low ? 1 : 12;
  const width = (high - low) / count;
  const bins = Array.from({ length: count }, (_, i) => ({ low: low + i * width, high: low + (i + 1) * width, volume: 0 }));
  for (const bar of bars) bins[width === 0 ? 0 : Math.min(count - 1, Math.floor((bar.close - low) / width))].volume += bar.volume;
  const total = bins.reduce((sum, bin) => sum + bin.volume, 0);
  const highest = bins.reduce((a, b) => a.volume >= b.volume ? a : b);
  return total > 0 ? { bins: bins.filter(bin => bin.volume > 0).reverse(), highest, total, control: (highest.low + highest.high) / 2 } : null;
}

export function calculateIndexLevels(points: LevelPoint[], close: number, rules = defaultIndexRules.day, dailyPoints = points) {
  const pivots = detectIndexPivots(points.slice(-rules.lookbackBars), rules.swingN);
  const asOf = points.at(-1)?.date ?? "";
  const fibHistory = points.slice(-120);
  const fibPivots = detectIndexPivots(fibHistory, rules.swingN, true);
  return {
    source: "고가·저가",
    swings: clusterIndexPivots(pivots, close, rules, asOf),
    candidates: pivots.filter(pivot => pivot.confirmedAt === null),
    fibonacci: fibonacciWave(fibPivots, fibHistory.length),
    profile: volumeProfile(dailyPoints),
  };
}
