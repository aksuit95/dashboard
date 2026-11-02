import { describe, expect, it } from "vitest";
import { preferredDiscountSeries } from "@/lib/market/preferred-discount";

describe("삼성전자 보통주·우선주 괴리율", () => {
  it("같은 거래일만 비교하고 보통주를 분모로 할인·할증을 계산한다", () => {
    expect(preferredDiscountSeries([
      { date: "2026-10-30", close: 100000 },
      { date: "2026-10-28", close: 80000 },
      { date: "2026-10-29", close: 90000 },
    ], [
      { date: "2026-10-28", close: 88000 },
      { date: "2026-10-30", close: 75000 },
      { date: "2026-11-02", close: 76000 },
    ])).toEqual([
      { date: "2026-10-28", commonKrw: 80000, preferredKrw: 88000, value: -10 },
      { date: "2026-10-30", commonKrw: 100000, preferredKrw: 75000, value: 25 },
    ]);
  });

  it("누락되거나 유효하지 않은 가격으로 괴리율을 만들지 않는다", () => {
    const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];
    expect(preferredDiscountSeries(
      dates.map((date, i) => ({ date, close: [0, -1, NaN, 100000, 100000][i] })),
      dates.map((date, i) => ({ date, close: [75000, 75000, 75000, Infinity, 0][i] })),
    )).toEqual([]);
    expect(preferredDiscountSeries([], [])).toEqual([]);
  });
});
