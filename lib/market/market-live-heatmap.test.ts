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
  const prices = Array<number | null>(31).fill(null);
  prices[0] = first;
  prices[30] = last;
  return { code, name: code, market: "KOSPI" as const, sector, close: 200, prices };
}

describe("장중 순환매 히트맵", () => {
  it("같은 기준일에 확인된 합산 시총으로 정렬하고 미확인 섹터는 뒤에 둔다", () => {
    const baselineDate = "2026-11-18";
    const day = { date, baselineDate, frames: [frame(30)], stockTape: { openAt: at(0), stocks: [stock("반도체", "A", 100, 104)] } };
    const totals = { "반도체": 200, "운송": 300 };
    const ranked = buildMarketLiveHeatmap({ ...day, sectorCapitalization: { asOf: baselineDate, totals } });
    expect(ranked?.names).toEqual(["운송", "반도체", "금융"]);
    const stale = buildMarketLiveHeatmap({ ...day, sectorCapitalization: { asOf: "2026-11-17", totals } });
    expect(stale?.names).toEqual(["반도체", "금융", "운송"]);
  });

  it("같은 종목의 구간 수익률을 쓰고 양쪽 가격이 있는 종목만 상승 확산도에 포함한다", () => {
    const stockTape = { openAt: at(0), stocks: [
      stock("반도체", "A", 100, 104), stock("반도체", "B", 80, 80), stock("반도체", "C", null, 110),
      stock("금융", "D", 50, 49), stock("금융", "E", 50, 50),
      stock("운송", "F", 100, 98), stock("운송", "G", 90, null),
    ] };
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(0), frame(30)] })!;
    const interval = view.intervals[0];
    expect(interval).toMatchObject({ start: at(0), end: at(30), marketPct: 0 });
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
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(0), frame(30), frame(75)] })!;
    expect(view.intervals[0].sectors.get("금융")).toMatchObject({ changePct: 5, relativePp: null, up: 1 });
    expect(view.intervals[1]).toMatchObject({ start: at(30), end: at(60), marketPct: null });
    expect(view.intervals[2]).toMatchObject({ start: at(60), end: at(75), scheduledEnd: at(90) });
  });

  it("경계 분이 빠지면 두 구간을 각각 안쪽 기록으로 계산하고 상세 종목도 같은 시각을 쓴다", () => {
    const stocks = [stock("반도체", "A", 100, null), stock("반도체", "B", 100, null),
      stock("금융", "C", 100, null), stock("금융", "D", 100, null)];
    for (const row of stocks) {
      row.prices[29] = 105;
      row.prices[33] = 110;
      row.prices[60] = 121;
    }
    const stockTape = { openAt: at(0), stocks };
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(0), frame(29), frame(33), frame(60)] })!;
    const [before, after] = view.intervals;
    expect(before).toMatchObject({ start: at(0), end: at(30), comparedFrom: at(0), comparedThrough: at(29), marketPct: 5 });
    expect(after).toMatchObject({ start: at(30), end: at(60), comparedFrom: at(33), comparedThrough: at(60), marketPct: 10 });
    expect(marketLiveIntervalStocks(stockTape, after, "반도체")).toMatchObject([{ price: 121, changePct: 10 }, { price: 121, changePct: 10 }]);
  });

  it("시장 절반을 비교할 수 있는 정시 경계를 우선하고 3분 넘는 이동은 허용하지 않는다", () => {
    const stockTape = { openAt: at(0), stocks: [stock("반도체", "A", 100, 110), stock("반도체", "B", 100, 110),
      stock("금융", "C", 100, 110), stock("금융", "D", 100, 110)] };
    for (const row of stockTape.stocks) {
      row.prices[29] = 105;
      row.prices[56] = 115;
      row.prices[61] = 121;
    }
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(0), frame(29), frame(30), frame(56), frame(61)] })!;
    expect(view.intervals[0]).toMatchObject({ comparedFrom: at(0), comparedThrough: at(30), marketPct: 10 });
    expect(view.intervals[1]).toMatchObject({ comparedFrom: at(30), comparedThrough: at(60), marketPct: null });
  });

  it("수능일 정규장 시간에 맞춰 10:00부터 16:30까지만 비교한다", () => {
    const stockTape = { openAt: at(0), stocks: [stock("금융", "A", 90, 99)] };
    const view = buildMarketLiveHeatmap({ date, baselineDate: "2026-11-18", stockTape, frames: [frame(-5), frame(390), frame(391)] })!;
    expect(view.through).toBe(Date.parse(date + "T16:30:00+09:00"));
    expect(view.intervals).toHaveLength(13);
    expect(view.intervals[0].start).toBe(Date.parse(date + "T10:00:00+09:00"));
    expect(view.intervals.at(-1)?.end).toBe(view.through);
  });
});
