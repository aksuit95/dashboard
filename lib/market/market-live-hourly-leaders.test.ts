import { describe, expect, it } from "vitest";
import { summarizeMarketLiveHourlyLeaders } from "./market-live-archive";
import { marketLiveTradingWindow } from "./market-live-session";

const date = "2026-11-18";
const at = (hm: string, day = date) => Date.parse(`${day}T${hm}:00+09:00`);

describe("시간대별 1위 섹터", () => {
  it("정각 기록을 새 구간에 넣고 기록이 있는 분의 선두 시간을 누적한다", () => {
    const minutes = [
      { time: at("09:00"), name: "반도체" },
      { time: at("09:01"), name: "자동차" },
      { time: at("09:59"), name: "반도체" },
      { time: at("10:00"), name: "반도체" },
      { time: at("10:02"), name: undefined },
      { time: at("10:03"), name: "자동차" },
    ];
    const { openAt, closeAt } = marketLiveTradingWindow(date)!;
    expect(summarizeMarketLiveHourlyLeaders(minutes, openAt, closeAt)).toMatchObject([
      { start: at("09:00"), end: at("10:00"), observed: 3, lead: { name: "반도체", minutes: 2, firstAt: at("09:00") } },
      { start: at("10:00"), end: at("11:00"), observed: 2, lead: { name: "자동차", minutes: 1, firstAt: at("10:03") } },
    ]);
  });

  it("특별장 개장부터 구간을 세고 마지막 반시간에서 마감 스냅샷을 집계 시간에 더하지 않는다", () => {
    const special = "2026-11-19";
    const { openAt, closeAt } = marketLiveTradingWindow(special)!;
    const minutes = [
      { time: at("10:02", special), name: "반도체" },
      { time: at("16:00", special), name: "자동차" },
      { time: at("16:29", special), name: "자동차" },
      { time: at("16:30", special), name: "반도체" },
    ];
    const rows = summarizeMarketLiveHourlyLeaders(minutes, openAt, closeAt);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ start: at("10:00", special), end: at("11:00", special) });
    expect(rows[1]).toMatchObject({ observed: 0, lead: null });
    expect(rows.at(-1)).toMatchObject({
      start: at("16:00", special), end: at("16:30", special), observed: 2, lead: { name: "자동차", minutes: 2 },
    });
  });
});
