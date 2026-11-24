import type { IndexBar } from "@/lib/sources/index-bars";

export type Bollinger = { upper: number; middle: number; lower: number; width: number };
export type Macd = { line: number; signal: number | null; histogram: number | null };

export function mean(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function percentile(values: readonly number[], rank: number) {
  const at = (values.length - 1) * rank;
  const lower = Math.floor(at);
  const higher = Math.ceil(at);
  return values[lower] + (values[higher] - values[lower]) * (at - lower);
}

function smoother(period: number, weight: number) {
  let total = 0;
  let count = 0;
  let last: number | null = null;
  return (value: number | null) => {
    if (value === null) {
      total = count = 0;
      last = null;
    } else if (last !== null) {
      last += (value - last) * weight;
    } else {
      total += value;
      if (++count === period) last = total / period;
    }
    return last;
  };
}

export function createIndexIndicators() {
  const gain = smoother(14, 1 / 14);
  const loss = smoother(14, 1 / 14);
  const fast = smoother(12, 2 / 13);
  const slow = smoother(26, 2 / 27);
  const macdSignal = smoother(9, 2 / 10);
  const trueRange = smoother(14, 1 / 14);
  const plus = smoother(14, 1 / 14);
  const minus = smoother(14, 1 / 14);
  const directional = smoother(14, 1 / 14);
  let previousClose: number | null = null;
  let previousBar: IndexBar | null = null;
  const bars: (IndexBar | null)[] = [];
  const stochasticValues: (number | null)[] = [];
  const stochasticK: (number | null)[] = [];

  const averageOfThree = (values: (number | null)[]) => {
    const window = values.slice(-3);
    return window.length === 3 && window.every(value => value !== null) ? mean(window) : null;
  };

  return (close: number | null, bar: IndexBar | null) => {
    const change = close === null || previousClose === null ? null : close - previousClose;
    previousClose = close;
    const up = gain(change === null ? null : Math.max(change, 0));
    const down = loss(change === null ? null : Math.max(-change, 0));
    const rsi = up === null || down === null ? null : down > 0 ? 100 - 100 / (1 + up / down) : up > 0 ? 100 : 50;
    const fastEma = fast(close);
    const slowEma = slow(close);
    const line = fastEma === null || slowEma === null ? null : fastEma - slowEma;
    const signal = macdSignal(line);
    const macd: Macd | null = line === null ? null : { line, signal, histogram: signal === null ? null : line - signal };

    const atr = trueRange(bar === null ? null : previousBar === null ? bar.high - bar.low :
      Math.max(bar.high - bar.low, Math.abs(bar.high - previousBar.close), Math.abs(bar.low - previousBar.close)));
    const higher = bar && previousBar ? bar.high - previousBar.high : null;
    const lower = bar && previousBar ? previousBar.low - bar.low : null;
    const upDm = plus(higher === null || lower === null ? null : higher > lower && higher > 0 ? higher : 0);
    const downDm = minus(higher === null || lower === null ? null : lower > higher && lower > 0 ? lower : 0);
    const adx = directional(upDm === null || downDm === null ? null :
      upDm + downDm === 0 ? 0 : Math.abs(upDm - downDm) / (upDm + downDm) * 100);
    previousBar = bar;

    bars.push(bar);
    const window = bars.slice(-14);
    let stochasticValue: number | null = null;
    if (bar && window.length === 14 && window.every(item => item !== null)) {
      const high = Math.max(...window.map(item => item.high));
      const low = Math.min(...window.map(item => item.low));
      stochasticValue = high === low ? 50 : (bar.close - low) / (high - low) * 100;
    }
    stochasticValues.push(stochasticValue);
    const k = averageOfThree(stochasticValues);
    stochasticK.push(k);
    const d = averageOfThree(stochasticK);

    return { rsi, macd, atr, adx, stochastic: { k, d } };
  };
}
