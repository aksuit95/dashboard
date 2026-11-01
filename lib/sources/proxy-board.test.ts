import { describe, expect, it } from "vitest";
import {
  bucketCandles,
  fxRate,
  kimchiPercent,
  parseBinanceKlines,
  parseBinancePerp,
  parseHyperliquidCandles,
  parseHyperliquidPerp,
  parseNaverCandles,
  parseNaverFxClose,
  parseNaverProxyQuote,
  parseUpbitUsdt,
  premiumVs,
  proxySessionLabel,
  seoulCompactToUnix,
} from "@/lib/sources/proxy-board";

const now = new Date("2026-10-30T15:40:00+09:00");

describe("프록시 시세 파서", () => {
  it("네이버 전일 종가와 정규장 종료를 구분한다", () => {
    const quote = parseNaverProxyQuote({
      closePrice: "225,000",
      compareToPreviousClosePrice: "-7,000",
      fluctuationsRatio: "-3.02",
      marketStatus: "OPEN",
      localTradedAt: "2026-10-30T15:40:22+09:00",
      overMarketPriceInfo: {
        overMarketStatus: "OPEN",
        overPrice: "226,000",
        compareToPreviousClosePrice: "-6,000",
        fluctuationsRatio: "-2.59",
        localTradedAt: "2026-10-30T15:40:43+09:00",
      },
    }, now);
    expect(quote).toMatchObject({
      price: 226000,
      previousClose: 232000,
      regularClose: 225000,
      nxtPrice: 226000,
      change: -6000,
      changePct: -2.59,
      sessionLabel: "정규장 종료",
      tradeDate: "10/30",
    });
  });

  it("정규장 시간에는 정규장 현재가를 쓴다", () => {
    const regular = new Date("2026-10-30T10:15:00+09:00");
    expect(proxySessionLabel({ marketStatus: "OPEN", overMarketStatus: "OPEN", now: regular })).toBe("정규장");
    expect(proxySessionLabel({ marketStatus: "OPEN", overMarketStatus: "OPEN", now: new Date("2026-10-30T08:20:00+09:00") })).toBe("시간외");
    expect(proxySessionLabel({ marketStatus: "CLOSE", overMarketStatus: "CLOSE", now: new Date("2026-10-30T21:10:00+09:00") })).toBe("장마감");
    const quote = parseNaverProxyQuote({
      closePrice: "225,000",
      compareToPreviousClosePrice: "-7,000",
      fluctuationsRatio: "-3.02",
      marketStatus: "OPEN",
      overMarketPriceInfo: { overMarketStatus: "OPEN", overPrice: "226,000", compareToPreviousClosePrice: "-6,000", fluctuationsRatio: "-2.59" },
    }, regular);
    expect(quote?.price).toBe(225000);
    expect(quote?.sessionLabel).toBe("정규장");
  });

  it("김프와 원화 환산 기준 환율을 고른다", () => {
    expect(kimchiPercent(1346, 1334)).toBeCloseTo(0.89955, 4);
    expect(kimchiPercent(null, 1334)).toBeNull();
    expect(fxRate({ upbitUsdt: 1346, naverUsdKrw: 1334 }, true)).toBe(1346);
    expect(fxRate({ upbitUsdt: 1346, naverUsdKrw: 1334 }, false)).toBe(1334);
    expect(fxRate({ upbitUsdt: null, naverUsdKrw: 1334 }, true)).toBe(1334);
    expect(premiumVs(227384, 225000)).toEqual({ pct: (2384 / 225000) * 100, diff: 2384 });
  });

  it("바이낸스 펀딩은 주기 금리를 시간당으로 나눈다", () => {
    const perp = parseBinancePerp({
      symbol: "SAMSUNGUSDT",
      premium: { markPrice: "168.88", lastFundingRate: "0.00007400" },
      ticker: { quoteVolume: "235768966.43" },
      openInterest: { openInterest: "153636.22" },
      fundingIntervalHours: 4,
    });
    expect(perp).toEqual({
      symbol: "SAMSUNGUSDT",
      markUsd: 168.88,
      quoteVolumeUsd: 235768966.43,
      openInterest: 153636.22,
      fundingHourly: 0.000074 / 4,
    });
  });

  it("하이퍼리퀴드 펀딩은 시간당 값 그대로 쓴다", () => {
    const perp = parseHyperliquidPerp([
      { universe: [{ name: "xyz:SKHX" }, { name: "xyz:SMSN" }] },
      [
        { markPx: "1", funding: "0.1", openInterest: "1", dayNtlVlm: "1" },
        { markPx: "168.78", funding: "0.0000412355", openInterest: "251870.33", dayNtlVlm: "62595701.23" },
      ],
    ], "xyz:SMSN");
    expect(perp?.markUsd).toBe(168.78);
    expect(perp?.fundingHourly).toBeCloseTo(0.0000412355, 10);
    expect(parseUpbitUsdt([{ trade_price: 1346 }])).toBe(1346);
    expect(parseNaverFxClose({ result: [{ closePrice: "1,334.00" }] })).toBe(1334);
  });

  it("캔들 시각을 맞추고 같은 버킷을 합친다", () => {
    expect(seoulCompactToUnix("20261030150000")).toBe(Date.parse("2026-10-30T15:00:00+09:00") / 1000);
    const naver = parseNaverCandles([
      { localDateTime: "20261030150000", openPrice: 10, highPrice: 12, lowPrice: 9, currentPrice: 11 },
      { localDate: "20261029", openPrice: 8, highPrice: 9, lowPrice: 7, closePrice: 8 },
    ]);
    expect(naver).toHaveLength(2);
    expect(naver[1]).toMatchObject({ open: 10, close: 11 });
    expect(parseBinanceKlines([[Date.parse("2026-10-30T15:00:00+09:00"), "1", "3", "0.5", "2", "9"]])).toEqual([
      { time: Date.parse("2026-10-30T15:00:00+09:00") / 1000, open: 1, high: 3, low: 0.5, close: 2 },
    ]);
    expect(parseHyperliquidCandles([{ t: 1_700_000_000_000, o: "1", h: "2", l: "0.5", c: "1.5" }])[0]?.close).toBe(1.5);
    const bucket = bucketCandles([
      { time: 100, open: 1, high: 2, low: 1, close: 1.5 },
      { time: 110, open: 1.5, high: 3, low: 1.2, close: 2.4 },
    ], 60);
    expect(bucket).toEqual([{ time: 60, open: 1, high: 3, low: 1, close: 2.4 }]);
  });
});
