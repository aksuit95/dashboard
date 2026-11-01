import { describe, expect, it } from "vitest";
import { parseDigestBreadth, parseQuoteBreadth } from "@/lib/sources/breadth-history";

describe("전 시장 등락", () => {
  it("합산 상승·하락·보합과 거래일을 읽는다", () => {
    expect(parseDigestBreadth({
      as_of: "20261028",
      market_breadth: { up: 1710, down: 823, flat: 244 },
    })).toEqual({
      market: "ALL",
      date: "2026-10-28",
      advancers: 1710,
      decliners: 823,
      unchanged: 244,
    });
  });

  it("세 칸이 모두 0이거나 수가 아니면 버린다", () => {
    expect(parseDigestBreadth({ as_of: "20261028", market_breadth: { up: 0, down: 0, flat: 0 } })).toBeNull();
    expect(parseDigestBreadth({ as_of: "20261028", market_breadth: { up: 10, down: "3", flat: 1 } })).toBeNull();
  });

  it("일별 시세의 전일대비 부호로 KOSPI·KOSDAQ만 센다", () => {
    const text = [
      "basDt,종목코드,종목명,mrktCtg,clpr,vs",
      "20261028,005930,삼성전자,KOSPI,100,1",
      "20261028,000660,SK하이닉스,KOSPI,100,-2",
      "20261028,005380,현대차,KOSPI,100,0",
      "20261028,091990,셀트리온,KOSDAQ,10,3",
      "20261028,123456,코넥스,KONEX,1,-1",
    ].join("\n");
    expect(parseQuoteBreadth(text)).toEqual([
      { market: "KOSDAQ", date: "2026-10-28", advancers: 1, decliners: 0, unchanged: 0 },
      { market: "KOSPI", date: "2026-10-28", advancers: 1, decliners: 1, unchanged: 1 },
    ]);
  });
});
