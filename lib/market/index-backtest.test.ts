import { describe, expect, it } from "vitest";
import { calculateIndexBacktest, calculateIndexBacktests, indexBacktestDefaults, indexEventStates, indexEventTypes, indexFirstEntries, indexReturnHistogram } from "./index-backtest";
import { calculateIndexTechnical } from "./index-technical";
import { defaultIndexRules } from "./index-rules";

const date = (i: number) => `2026-11-${String(i + 2).padStart(2, "0")}`;
const rows = (closes: (number | null)[], rsi: (number | null)[]) => closes.map((close, i) => ({ date: date(i), close, bar: null, disparity: {}, rsi: rsi[i] }));

describe("지수 과거 신호 검증", () => {
  it("연속 구간은 첫 진입만 세고 쿨다운에 걸린 구간은 재집계하지 않는다", () => {
    const states = [null, true, true, false, true, true, false, true, true, true, false, true];
    expect(indexFirstEntries(states, 0)).toEqual([4, 7, 11]);
    expect(indexFirstEntries(states, 4)).toEqual([4, 11]);
    expect(indexFirstEntries([false, true, null, true, false, true], 0)).toEqual([1, 5]);
  });

  it("같은 시작일 범위에서 수익률 표본을 비교하고 만기 전 신호는 수익률에서만 제외한다", () => {
    const data = rows([100, 100, 110, 99, 120, 144, 144], [40, 20, 20, 45, 20, 20, 45]);
    const result = calculateIndexBacktest(data, defaultIndexRules.day, { ...indexBacktestDefaults.day, event: "rsi-low", cooldownBars: 0, horizons: [1, 2, 3] });
    expect(result.events.map(item => item.date)).toEqual([date(1), date(4)]);
    expect(result.start).toBe(date(1));
    const [h1, h2, h3] = result.horizons;
    expect(h1.signal?.count).toBe(2);
    expect(h1.signal?.average).toBeCloseTo(15);
    expect(h1.signal?.median).toBeCloseTo(15);
    expect(h1.signal?.winRate).toBe(100);
    expect(h1.signal?.p25).toBeCloseTo(12.5);
    expect(h1.signal?.p75).toBeCloseTo(17.5);
    expect(h1.baseline?.count).toBe(5);
    expect(h1.start).toBe(date(1));
    expect(h1.end).toBe(date(5));
    expect(h2.baseline?.count).toBe(4);
    expect(h3.signal?.count).toBe(1);
    expect(h3.baseline?.count).toBe(3);
    expect(h1.bins.reduce((sum, bin) => sum + bin.signal, 0)).toBe(2);
  });

  it("결측 종가를 건너뛰어 기간을 당기지 않고 실현된 결과만 겹침을 검사한다", () => {
    const data = rows([100, 100, null, 99, 110, 120, 144, 144], [40, 20, null, 45, 20, 40, 20, 20]);
    const result = calculateIndexBacktest(data, defaultIndexRules.day, { ...indexBacktestDefaults.day, event: "rsi-low", cooldownBars: 0, horizons: [1, 2, 3] });
    expect(result.events.map(item => item.date)).toEqual([date(1), date(4), date(6)]);
    const [h1, h2, h3] = result.horizons;
    expect(h1.signal?.count).toBe(2);
    expect(h1.signal?.winRate).toBe(50);
    expect(h1.overlap).toBe(false);
    expect(h2.signal?.count).toBe(2);
    expect(h2.overlap).toBe(false);
    expect(h3.overlap).toBe(false);
    const longer = calculateIndexBacktest([...data, ...rows([130, 132], [40, 40]).map((item, i) => ({ ...item, date: date(8 + i) }))],
      defaultIndexRules.day, { ...indexBacktestDefaults.day, event: "rsi-low", cooldownBars: 0, horizons: [1, 2, 3] });
    expect(longer.horizons[2].overlap).toBe(true);
  });

  it("지지선 근접은 직전 봉에 확정된 레벨만 쓰고 미래 데이터를 붙여도 이전 판정이 유지된다", () => {
    const data = [104, 100, 104, 96, 100, 96, 100, 110].map((close, i) => ({ date: date(i), close, rsi: null, disparity: {},
      bar: { date: date(i), close, open: close, volume: 10, high: close + 1, low: [103, 95, 102, 95.5, 99, 95.5, 99, 105][i] } }));
    const rules = { ...defaultIndexRules.day, swingN: 1, minTouches: 1 };
    const settings = { ...indexBacktestDefaults.day, event: "support-near" as const, cooldownBars: 0, proximityPct: 1.2 };
    const states = indexEventStates(data, rules, settings);
    expect(states.slice(0, 4)).toEqual(indexEventStates(data.slice(0, 4), rules, settings));
    expect(states.slice(0, 6)).toEqual([null, null, null, true, false, true]);
    expect(indexFirstEntries(states, 0)).toEqual([5]);
  });

  it("A에서 계산한 이격도 상태를 사용하며 미완성 봉과 특별 운영일을 검증에서 제외한다", () => {
    const dates = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23"];
    const data = dates.map((day, i) => ({ date: day, close: 100 + i, regular1530: i !== 3, incomplete: i === 5 }));
    const analysis = calculateIndexTechnical(data)!;
    expect(analysis.completed.map(point => point.date)).toEqual(dates.filter((_, i) => i !== 3 && i !== 5));
    const window = ["미확인", "과열", "중립", "침체"].map((status, i) => ({ ...analysis.completed[i],
      disparity: { 20: { value: 100, rank: null, reference: null, status: status as "미확인" | "과열" | "중립" | "침체" } } }));
    expect(indexEventStates(window, defaultIndexRules.day, indexBacktestDefaults.day)).toEqual([null, false, false, true]);
  });

  it("두 분포에 동일한 구간을 사용하고 경계 표본을 빠짐없이 배정한다", () => {
    const bins = indexReturnHistogram([-15, 0, 15], [-10, 5, 15, 15]);
    expect(bins[0]).toMatchObject({ lower: -15, signal: 1 });
    expect(bins.at(-1)).toMatchObject({ upper: 15, signal: 1, baseline: 2 });
    expect(bins.reduce((sum, bin) => sum + bin.baseline, 0)).toBe(4);
  });

  it("비교표의 여섯 신호가 한 번에 계산되어 개별 검증과 같은 값을 반환한다", () => {
    const data = rows([100, 104, 99, 108, 100, 112, 101, 108, 99, 102], [45, 20, 40, 72, 55, 25, 70, 24, 14, 45])
      .map((point, i) => ({ ...point, bar: { date: point.date, close: point.close!, open: point.close!, high: point.close! + 1, low: point.close! - 1, volume: 1 },
        disparity: { 10: { value: 100, reference: { lower: 95, upper: 105, samples: 80 }, rank: 50, status: i % 2 ? "침체" as const : "과열" as const } } }));
    const rules = { ...defaultIndexRules.week, swingN: 1, minTouches: 1 };
    const settings = indexBacktestDefaults.week;
    const comparison = calculateIndexBacktests(data, rules, settings);
    expect(Object.keys(comparison)).toEqual(indexEventTypes);
    for (const event of indexEventTypes) expect(comparison[event]).toEqual(calculateIndexBacktest(data, rules, { ...settings, event }));
  });
});
