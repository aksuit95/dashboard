import { describe, expect, it } from "vitest";
import { buildMarketLiveHeatmap, marketLiveIntervalStocks, type MarketLiveHeatmapDay } from "./market-live-heatmap";
import { marketLiveTradingWindow } from "./market-live-session";

const date = "2026-11-19";
const session = marketLiveTradingWindow(date)!;
const at = (minute: number) => session.openAt + minute * 60_000;

function frame(minute: number): MarketLiveHeatmapDay["frames"][number] {
  const time = new Date(at(minute)).toISOString();
  return {
    minuteAt: time, collectedAt: time,
    sectors: [{ name: "반도체", total: 3 }, { name: "금융", total: 2 }, { name: "운송", total: 3 }]
      .map(row => ({ ...row, changePct: null, up: 0, compared: 0, asOf: null })),
  };
}

function stock(sector: string, code: string, first: number | null, last: number | null) {
  const prices = Array<number | null>(11).fill(null);
  prices[0] = first;
  prices[10] = last;
  return { code, name: code, market: "KOSPI" as const, sector, close: 200, prices };
}

describe("장중 순환매 히트맵", () => {
  it("같은 종목의 구간 수익률을 쓰고 양쪽 가격이 있는 종목만 상승 확산도에 포함한다", () => {
    const stockTape = { openAt: at(0), stocks: [
      stock("반도체", "A", 100, 104), stock("반도체", "B", 80, 80), stock("반도체", "C", null, 110),
      stock("금융", "D", 50, 49), stock("금융", "E", 50, 50),
      stock("운송", "F", 100, 98), stock("운송", "G", 90, null),
    ] };
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(0), frame(10)] })!;
    const interval = view.intervals[0];
    expect(interval).toMatchObject({ start: at(0), end: at(10), marketPct: 0 });
    expect(interval.sectors.get("반도체")).toMatchObject({ up: 1, compared: 2, total: 3, changePct: 2, relativePp: 2 });
    expect(interval.sectors.get("금융")).toMatchObject({ up: 0, compared: 2, relativePp: -1 });
    expect(interval.sectors.get("운송")).toMatchObject({ up: 0, compared: 1, total: 3, relativePp: null });
    expect(marketLiveIntervalStocks(stockTape, interval, "반도체")).toMatchObject([
      { code: "A", price: 104, changePct: 4 },
      { code: "B", price: 80, changePct: 0 },
      { code: "C", price: 110, changePct: null },
    ]);
  });

  it("시장 표본 부족과 중간 기록 누락을 유지하고 진행 중인 구간을 표시한다", () => {
    const stockTape = { openAt: at(0), stocks: [stock("금융", "A", 90, 99), stock("금융", "B", 90, 90)] };
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(0), frame(10), frame(25)] })!;
    expect(view.intervals[0].sectors.get("금융")).toMatchObject({ changePct: 5, relativePp: null, up: 1 });
    expect(view.intervals[1]).toMatchObject({ start: at(10), end: at(20), marketPct: null });
    expect(view.intervals[2]).toMatchObject({ start: at(20), end: at(25), scheduledEnd: at(30) });
  });

  it("수능일 정규장 시간에 맞춰 10:00부터 16:30까지만 비교한다", () => {
    const stockTape = { openAt: at(0), stocks: [stock("금융", "A", 90, 99)] };
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(-5), frame(390), frame(391)] })!;
    expect(view.through).toBe(Date.parse(date + "T16:30:00+09:00"));
    expect(view.intervals).toHaveLength(39);
    expect(view.intervals[0].start).toBe(Date.parse(date + "T10:00:00+09:00"));
    expect(view.intervals.at(-1)?.end).toBe(view.through);
  });
});
