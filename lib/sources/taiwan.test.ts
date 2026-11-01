import { describe, expect, it } from "vitest";
import { parseTaiwanRevenue } from "@/lib/sources/taiwan";

const watch = [{ symbol: "2330", name: "TSMC", sector: "파운드리" }];

describe("대만 월매출", () => {
  it("민국 연월을 서기로 바꾸고 당월·상월·작년 동월을 저장한다", () => {
    const rows = parseTaiwanRevenue([
      {
        公司代號: "2330",
        公司名稱: "台積電",
        資料年月: "11509",
        "營業收入-當月營收": "511,857,399",
        "營業收入-上月營收": "514,805,337",
        "營業收入-去年當月營收": "330,980,920",
      },
    ], watch);
    expect(rows).toEqual([
      { symbol: "2330", name: "TSMC", sector: "파운드리", period: "2026-09", revenue: 511_857_399 },
      { symbol: "2330", name: "TSMC", sector: "파운드리", period: "2026-08", revenue: 514_805_337 },
      { symbol: "2330", name: "TSMC", sector: "파운드리", period: "2025-09", revenue: 330_980_920 },
    ]);
  });

  it("1월의 상월은 전년 12월이다", () => {
    const rows = parseTaiwanRevenue([
      {
        公司代號: "2330",
        資料年月: "11501",
        "營業收入-當月營收": 10,
        "營業收入-上月營收": 9,
        "營業收入-去年當月營收": 8,
      },
    ], watch);
    expect(rows?.map((row) => row.period)).toEqual(["2026-01", "2025-12", "2025-01"]);
  });
});
