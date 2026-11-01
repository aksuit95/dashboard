import { describe, expect, it } from "vitest";
import { parseNaverTradingValue, tradingTextToEok } from "@/lib/sources/naver";
import { parseTrendDepositPage } from "@/lib/sources/flow";

describe("증시자금 파서", () => {
  it("예탁금과 신용잔고를 발표일 그대로 읽고 시총 비율은 비운다", () => {
    const rows = parseTrendDepositPage({
      content: [
        { bizdate: "20261028", customerDeposit: "882,975", creditLoan: "289137" },
        { bizdate: "20261027", customerDeposit: "", creditLoan: "1" },
      ],
    });
    expect(rows).toEqual([
      { date: "2026-10-28", deposits: 882975, credit: 289137, creditPct: null, kospi: null, kosdaq: null },
      { date: "2026-10-27", deposits: null, credit: 1, creditPct: null, kospi: null, kosdaq: null },
    ]);
    expect(parseTrendDepositPage({ items: [] })).toBeNull();
  });

  it("거래대금은 백만 원 문자열을 억 원으로 바꾸고 단위가 없으면 버린다", () => {
    expect(tradingTextToEok("12,505,933백만")).toBeCloseTo(125059.33, 2);
    expect(tradingTextToEok("10억")).toBe(10);
    expect(tradingTextToEok("100")).toBeNull();
    expect(tradingTextToEok("0백만")).toBeNull();
    const trading = parseNaverTradingValue({
      totalInfos: [{ code: "accumulatedTradingValue", value: "12,505,933백만" }],
      dealTrendInfo: { bizdate: "20261030" },
    }, "KOSPI", "2026-10-31");
    expect(trading?.market).toBe("KOSPI");
    expect(trading?.date).toBe("2026-10-30");
    expect(trading?.valueEok).toBeCloseTo(125059.33, 2);
  });
});
