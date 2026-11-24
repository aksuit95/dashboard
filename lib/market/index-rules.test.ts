import { describe, expect, it } from "vitest";
import { calculateIndexTechnical } from "./index-technical";
import { clusterIndexPivots, detectIndexPivots, type IndexPivot } from "./index-levels";
import { calculateIndexDisparities, defaultIndexRules, restoreIndexSettings } from "./index-rules";
import { resampleIndexSessions, type IndexSession } from "./index-timeframe";

const row = (date: string, close: number, open = close, high = close + 1, low = close - 1, volume = 10): IndexSession => ({
  date, close, regular1530: true, bar: { date, open, high, low, close, volume },
});

describe("지수 기술적 분석 규칙", () => {
  it("오른쪽 N봉이 확보된 날짜에만 스윙 고점과 저점을 확정한다", () => {
    const bars = [8, 9, 14, 7, 6, 9, 11].map((close, i) => row(`2026-11-${String(10 + i).padStart(2, "0")}`, close));
    const pending = detectIndexPivots(bars.slice(0, 4).map(item => ({ ...item, bar: item.bar! })), 2);
    expect(pending.find(item => item.date === "2026-11-12")).toMatchObject({ kind: "high", confirmedAt: null });
    const confirmed = detectIndexPivots(bars.map(item => ({ ...item, bar: item.bar! })), 2);
    expect(confirmed.find(item => item.date === "2026-11-12")?.confirmedAt).toBe("2026-11-14");
    expect(confirmed.find(item => item.date === "2026-11-14")?.confirmedAt).toBe("2026-11-16");
    const invalidated = [...bars.slice(0, 4), row("2026-11-14", 15)].map(item => ({ ...item, bar: item.bar! }));
    expect(detectIndexPivots(invalidated, 2).some(item => item.date === "2026-11-12")).toBe(false);
  });

  it("확정일 필터, 가격 허용차, 최소 터치 및 양쪽 최근접 레벨 수를 적용한다", () => {
    const pivots: IndexPivot[] = [95, 95.1, 95.3, 98.9, 99, 101, 101.5, 99.1, 103].map((price, i) => ({
      date: `2026-11-${10 + i}`, kind: "high", price, index: i, confirmedAt: i === 7 ? "2026-11-25" : "2026-11-21",
    }));
    const levels = clusterIndexPivots(pivots, 100, { ...defaultIndexRules.day, clusterTolPct: 1, minTouches: 2, maxLevels: 1 }, "2026-11-24");
    expect(levels).toMatchObject([
      { price: 98.95, touches: 2, side: "support", lastTouch: "2026-11-14" },
      { price: 101.25, touches: 2, side: "resistance", lastTouch: "2026-11-16" },
    ]);
  });

  it("시점별 백분위는 당일과 미래 관측값을 분포에서 제외하고 최근 N봉을 적용한다", () => {
    const rows = [100, 100, 100, 160, 40, 100, 100].map((close, i) => ({ date: `2026-11-${10 + i}`, close }));
    const rules = { ...defaultIndexRules.day, maPeriods: [2, 3, 4] as [number, number, number], pctlLookback: 2 };
    const current = calculateIndexDisparities(rows, rules, 2)[0].points;
    const prefix = calculateIndexDisparities(rows.slice(0, 4), rules, 2)[0].points;
    expect(current.slice(0, 4)).toEqual(prefix);
    expect(current[3]).toMatchObject({ reference: { upper: 100, lower: 100, samples: 2 }, status: "과열" });
    expect(current[4].reference?.upper).toBeGreaterThan(100);
    expect(current[6].reference?.upper).toBeGreaterThan(100);
  });

  it("고정 모드는 기준일까지의 관측치로 임계치를 만들고 이후에만 사용한다", () => {
    const rows = [100, 100, 100, 160, 40, 100, 100].map((close, i) => ({ date: `2026-11-${10 + i}`, close }));
    const rules = { ...defaultIndexRules.day, maPeriods: [2, 3, 4] as [number, number, number], expanding: false, calibrationEnd: "2026-11-12" };
    const points = calculateIndexDisparities(rows, rules, 2)[0].points;
    expect(points.slice(0, 3).every(item => item.reference === null)).toBe(true);
    expect(points.slice(3).map(item => item.reference)).toEqual(Array(4).fill({ upper: 100, lower: 100, samples: 2 }));
  });

  it("KRX 15:30 일봉으로 주·월봉을 집계하고 남은 거래일이 있는 봉을 구분한다", () => {
    const daily = [row("2026-11-16", 100, 98, 102, 95), row("2026-11-18", 105, 100, 109, 99, 20),
      { ...row("2026-11-19", 999), regular1530: false }, row("2026-11-20", 103), row("2026-11-23", 107)];
    const week = resampleIndexSessions(daily, "week");
    expect(week).toMatchObject([
      { date: "2026-11-20", incomplete: false, bar: { open: 98, high: 109, low: 95, close: 103, volume: 40 } },
      { date: "2026-11-23", incomplete: true, close: 107 },
    ]);
    expect(resampleIndexSessions(daily, "month")).toMatchObject([{ incomplete: true, bar: { open: 98, high: 109, low: 95, close: 107, volume: 50 } }]);
    expect(resampleIndexSessions([row("2026-07-16", 100)], "week")[0].incomplete).toBe(false);
    const output = calculateIndexTechnical(daily, "week")!;
    expect(output.latest.date).toBe("2026-11-20");
    expect(output.chartLatest).toMatchObject({ incomplete: true, disparity: {}, rsi: null });
  });

  it("일반 거래일 OHLC가 결측이면 해당 기간 전체 캔들을 만들지 않는다", () => {
    const rows = [row("2026-11-16", 100), { date: "2026-11-17", close: 101, regular1530: true }, row("2026-11-20", 110)];
    const week = resampleIndexSessions(rows, "week");
    expect(week[0]).toMatchObject({ close: 110, date: "2026-11-20", incomplete: false });
    expect(week[0].bar).toBeUndefined();
  });

  it("봉 주기별 저장값을 복원하고 범위를 벗어난 설정은 기본값을 사용한다", () => {
    const settings = restoreIndexSettings({ timeframe: "week", rules: {
      week: { ...defaultIndexRules.week, swingN: 4 }, month: { ...defaultIndexRules.month, minTouches: 0 },
    } });
    expect(settings.timeframe).toBe("week");
    expect(settings.rules.week.swingN).toBe(4);
    expect(settings.rules.day.maPeriods).toEqual([20, 60, 120]);
    expect(settings.rules.month).toEqual(defaultIndexRules.month);
  });
});
