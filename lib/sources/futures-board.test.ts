import { describe, expect, it } from "vitest";
import { clockSession, parseNaverFuturesQuote, parseYahooChartQuote, usCashSession } from "@/lib/sources/futures-board";

describe("선물·매크로 시세", () => {
  it("야후 전일 대비는 fulldayChange 를 쓴다", () => {
    const quote = parseYahooChartQuote({
      chart: {
        result: [{
          meta: {
            fulldayPrice: 28971,
            fulldayChange: -591,
            fulldayChangePercent: -2,
            chartPreviousClose: 29437.25,
            regularMarketTime: 1_700_000_000,
          },
        }],
      },
    });
    expect(quote).toEqual({
      price: 28971,
      change: -591,
      changePct: -2,
      tradedAtMs: 1_700_000_000_000,
    });
  });

  it("네이버 선물 장마감과 등락을 읽는다", () => {
    expect(parseNaverFuturesQuote({
      closePrice: "915.10",
      compareToPreviousClosePrice: "-19.90",
      fluctuationsRatio: "-2.13",
      marketStatus: "CLOSE",
    })).toEqual({ price: 915.1, change: -19.9, changePct: -2.13, session: "closed" });
    expect(parseNaverFuturesQuote({ closePrice: "900", marketStatus: "OPEN" })?.session).toBe("live");
  });

  it("시세 시각이 20분을 넘으면 장마감이다", () => {
    const now = Date.parse("2026-10-30T07:00:00Z");
    expect(clockSession(now - 5 * 60 * 1000, now)).toBe("live");
    expect(clockSession(now - 21 * 60 * 1000, now)).toBe("closed");
    expect(clockSession(null, now)).toBe("closed");
  });

  it("미국 정규장 밖이면 금리는 장마감이다", () => {
    expect(usCashSession(new Date("2026-10-30T14:00:00Z"))).toBe("live");
    expect(usCashSession(new Date("2026-10-30T21:00:00Z"))).toBe("closed");
    expect(usCashSession(new Date("2026-10-31T15:00:00Z"))).toBe("closed");
  });
});
