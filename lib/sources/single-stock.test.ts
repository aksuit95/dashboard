import { describe, expect, it } from "vitest";
import { parseSingleStockEtf, premiumPercent } from "@/lib/sources/single-stock";

describe("단일종목 ETF 괴리율", () => {
  it("현재가를 iNAV 로 나눈 괴리율이다", () => {
    expect(premiumPercent(8570, 8422.99)).toBeCloseTo(1.75, 2);
    expect(premiumPercent(10270, 10513.91)).toBeCloseTo(-2.32, 2);
    expect(premiumPercent(8570, null)).toBeNull();
    expect(premiumPercent(8570, 0)).toBeNull();
  });

  it("네이버 ETF 현재가와 iNAV 를 읽는다", () => {
    expect(parseSingleStockEtf({
      closePrice: "8,570",
      compareToPreviousClosePrice: "-510",
      fluctuationsRatio: "-5.62",
      iNav: "8,422.99",
      nav: "9,076.55",
    })).toEqual({
      price: 8570,
      change: -510,
      changePct: -5.62,
      premium: expect.closeTo(1.75, 2),
    });
    expect(parseSingleStockEtf({ nav: "9000" })).toBeNull();
  });
});
