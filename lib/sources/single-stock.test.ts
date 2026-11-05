import { describe, expect, it, vi } from "vitest";
import { loadSingleStockBoard, parseSingleStockEtf, premiumPercent } from "@/lib/sources/single-stock";

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

describe("기초 종목 KRX 종가", () => {
  const fetcher = (items: object[]) => vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes("daily-prices")
    ? Response.json({ hasNext: false, items }) : Response.json({ closePrice: "100", iNav: "100" }));
  it("장 시작 전에는 직전 거래일의 KRX 종가끼리 등락률을 계산한다", async () => {
    const request = fetcher([
      { tradingDateKst: "2026-11-04", regularMarketClosingPrice: "110", closingPrice: "150" },
      { tradingDateKst: "2026-11-03", regularMarketClosingPrice: "100", closingPrice: "130" },
    ]);
    const board = await loadSingleStockBoard(request, new Date("2026-11-05T08:00:00+09:00"));
    for (const group of board.names) {
      expect(group).toMatchObject({ price: 110, priceAsOf: "2026-11-04", priceBasis: "KRX_REGULAR_CLOSE" });
      expect(group.changePct).toBeCloseTo(10);
    }
  });
  it("KRX 종가가 없거나 이전 거래일이 누락되면 통합 가격을 대신 쓰지 않는다", async () => {
    const missing = await loadSingleStockBoard(fetcher([{ tradingDateKst: "2026-11-04", closingPrice: "150" }]), new Date("2026-11-05T08:00:00+09:00"));
    expect(missing.names[0]).toMatchObject({ price: null, changePct: null });
    const gap = await loadSingleStockBoard(fetcher([
      { tradingDateKst: "2026-11-04", regularMarketClosingPrice: "110" },
      { tradingDateKst: "2026-11-02", regularMarketClosingPrice: "100" },
    ]), new Date("2026-11-05T08:00:00+09:00"));
    expect(gap.names[0]).toMatchObject({ price: 110, changePct: null });
  });
  it("정규장에는 KRX 지정 현재가와 직전 KRX 종가를 사용한다", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async url => {
      const path = String(url);
      if (path.includes("daily-prices")) return Response.json({ hasNext: false, items: [{ tradingDateKst: "2026-11-04", regularMarketClosingPrice: "100", closingPrice: "140" }] });
      if (path.includes("codeType=KRX")) return Response.json({ itemcode: path.includes("005930") ? "005930" : "000660", tradeTime: "20261105100000", nowPrice: "110", marketStatus: "OPEN", tradingSessionType: "REGULAR_MARKET" });
      return Response.json({ closePrice: "100", iNav: "100" });
    });
    const board = await loadSingleStockBoard(request, new Date("2026-11-05T10:00:01+09:00"));
    expect(board.names[0]).toMatchObject({ price: 110, priceAsOf: "2026-11-05", priceBasis: "KRX_REGULAR_LIVE", priceTime: "2026-11-05T10:00:00+09:00" });
    expect(board.names[0].changePct).toBeCloseTo(10);
    expect(request.mock.calls.some(([url]) => String(url).includes("codeType=KRX"))).toBe(true);
  });
  it("15:30 이후에는 당일 종가가 발표되기 전까지 이전 값을 당일 가격으로 표시하지 않는다", async () => {
    const board = await loadSingleStockBoard(fetcher([
      { tradingDateKst: "2026-11-04", regularMarketClosingPrice: "110" },
    ]), new Date("2026-11-05T15:30:00+09:00"));
    expect(board.names[0]).toMatchObject({ priceAsOf: "2026-11-05", price: null, changePct: null });
  });
});
