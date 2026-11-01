import { describe, expect, it } from "vitest";
import { parseKoreanDisplay, parseNaverEtfBasic } from "@/lib/sources/etf";
import { parseYahooEtfFacts } from "@/lib/sources/yahoo";

describe("ETF NAV 와 구성종목", () => {
  it("네이버 NAV 와 순자산으로 좌수를 구하고 iNav 는 쓰지 않는다", () => {
    expect(parseKoreanDisplay("4조 9,402억")).toBe(4_940_200_000_000);
    const facts = parseNaverEtfBasic({
      closePrice: "106,880",
      iNav: "107,038.53",
      nav: "114,554.28",
      totalNav: "4조 9,402억",
      constituentList: [
        { itemCode: "005930", itemName: "삼성전자", constituentWeight: 19 },
        { itemCode: "000660", itemName: "SK하이닉스", constituentWeight: 18.17 },
      ],
    });
    expect(facts?.nav).toBeCloseTo(114554.28, 2);
    expect(facts?.shares).toBeCloseTo(4_940_200_000_000 / 114554.28, 2);
    expect(facts?.holdings.map((row) => row.symbol)).toEqual(["005930", "000660"]);
    expect(parseNaverEtfBasic({ iNav: "107038", closePrice: "106880" })).toBeNull();
  });

  it("야후 비중은 퍼센트로 맞추고 시장 가격을 NAV 로 쓰지 않는다", () => {
    const facts = parseYahooEtfFacts({
      quoteSummary: {
        result: [{
          price: { regularMarketPrice: { raw: 300 } },
          summaryDetail: { navPrice: { raw: 298.5 }, totalAssets: { raw: 1_000 } },
          defaultKeyStatistics: { sharesOutstanding: { raw: 7_650_000 } },
          topHoldings: { holdings: [{ symbol: "NVDA", holdingName: "NVIDIA", holdingPercent: { raw: 0.08 } }] },
        }],
      },
    });
    expect(facts).toEqual({
      shares: 7_650_000,
      nav: 298.5,
      aum: 1_000,
      holdings: [{ symbol: "NVDA", name: "NVIDIA", weight: 8 }],
    });
  });
});
