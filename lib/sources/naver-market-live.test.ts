import { describe, expect, it, vi } from "vitest";
import { fetchNaverLiveIndex, fetchNaverLiveStocks } from "./naver-market-live";

const date = "2026-11-18";
const openAt = Date.parse(`${date}T09:00:00+09:00`);
const closeAt = Date.parse(`${date}T15:30:00+09:00`);
const now = Date.parse(`${date}T15:00:00+09:00`);
const quoteAt = `${date}T14:59:55+09:00`;

function stock(itemCode: string, localTradedAt = quoteAt) {
  return {
    itemCode, localTradedAt, stockEndType: "stock", stockExchangeType: "KOSPI", currencyType: "KRW",
    tradableStatus: "tradable", currentPrice: "120000", accumulatedTradingValue: "250000000",
    overMarketPriceInfo: { overPrice: "190000", localTradedAt: quoteAt },
  };
}

describe("Naver KRX intraday stocks", () => {
  it("uses only explicitly selected KRX trades in the requested session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      domesticKrx: {
        "005930": stock("005930"),
        "000660": { ...stock("000660"), currentPrice: null },
        "035420": stock("035420", "2026-11-17T15:30:00+09:00"),
        "066570": stock("066570", `${date}T08:55:00+09:00`),
        "005380": stock("005380", `${date}T16:10:00+09:00`),
        "051910": stock("051910", `${date}T15:01:00+09:00`),
      },
      domesticNxt: { "035720": stock("035720") },
    }));
    const codes = ["005930", "000660", "035420", "066570", "005380", "035720", "051910", "005930", "x&y=1"];
    const result = await fetchNaverLiveStocks(codes, date, openAt, closeAt, now, fetcher);
    expect(result).toEqual({ quotes: [{ code: "005930", price: 120000, turnover: 250000000, asOf: quoteAt }], failedBatches: 0 });
    expect(fetcher.mock.calls[0][0]).toContain("domesticKrxCodes=005930,000660,035420,066570,005380,035720,051910");
  });

  it("keeps valid rows when a separate batch fails", async () => {
    const codes = Array.from({ length: 101 }, (_, index) => String(index).padStart(6, "0"));
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ domesticKrx: { "000100": stock("000100") } }));
    const result = await fetchNaverLiveStocks(codes, date, openAt, closeAt, now, fetcher);
    expect(result.failedBatches).toBe(1);
    expect(result.quotes.map(row => row.code)).toEqual(["000100"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("Naver KRX intraday index", () => {
  const chart = {
    code: "KOSPI", stockExchangeType: "KRX", infoType: "index", periodType: "day",
    tradeBaseAt: "20261118", lastTradeBaseAt: "20261117", lastClosePrice: 4950,
    priceInfos: [
      { localDateTime: "20261117153000", currentPrice: 4950 },
      { localDateTime: "20261118085900", currentPrice: 4975 },
      { localDateTime: "20261118145900", currentPrice: 5050 },
      { localDateTime: "20261118090000", currentPrice: 5000 },
      { localDateTime: "20261118150100", currentPrice: 5055 },
    ],
  };

  it("keeps the prior close and the current-session chart separate from the snapshot", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        domesticIndex: { KOSPI: {
          itemCode: "KOSPI",
          meta: { exchangeCode: "KRX", marketCode: "KOSPI", zoneId: "Asia/Seoul" },
          price: { currentPrice: "5052.25", localTradedAt: quoteAt, tradingValue: "120000000" },
          breadth: { exchangeType: "KRX", risingCount: "12", fallingCount: "8", unchangedCount: "1" },
        } },
      }))
      .mockResolvedValueOnce(Response.json(chart));
    expect(await fetchNaverLiveIndex("KOSPI", date, openAt, closeAt, now, fetcher)).toEqual({
      asOf: quoteAt, price: 5052.25, turnover: 120000000,
      breadth: { advancers: 12, decliners: 8, unchanged: 1 },
      previousClose: 4950, previousDate: "2026-11-17",
      points: [{ time: `${date}T09:00:00+09:00`, value: 5000 }, { time: `${date}T14:59:00+09:00`, value: 5050 }],
    });
  });

  it("rejects index data with the wrong exchange or trading date", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        domesticIndex: { KOSPI: {
          itemCode: "KOSPI",
          meta: { exchangeCode: "NXT", marketCode: "KOSPI", zoneId: "Asia/Seoul" },
          price: { currentPrice: "5052.25", localTradedAt: quoteAt },
        } },
      }))
      .mockResolvedValueOnce(Response.json({ ...chart, tradeBaseAt: "20261117" }));
    expect(await fetchNaverLiveIndex("KOSPI", date, openAt, closeAt, now, fetcher)).toMatchObject({
      price: null, asOf: null, points: [], previousClose: null,
    });
  });
});
