import { describe, expect, it, vi } from "vitest";
import { fetchKrxDailyBars, fetchKrxDailyCloses, parseKrxDailyPage } from "./krx-daily-prices";
import { calculateReturns, returnPeriods } from "@/lib/market/sector-returns";

describe("KRX 정규장 종가 전용 시세", () => {
  it("NXT 포함 종가를 무시하고 정규장 종가만 선택하며 장중 데이터는 제외한다", () => {
    const result = parseKrxDailyPage({ hasNext: false, items: [
      { tradingDateKst: "2026-11-03", closingPrice: "999" },
      { tradingDateKst: "2026-11-02", closingPrice: "230000", regularMarketClosingPrice: "229000" },
      { tradingDateKst: "2026-10-30", closingPrice: "220500", regularMarketClosingPrice: "225000" },
    ] }, "2026-11-02");
    expect(result.bars).toEqual([{ date: "2026-11-02", close: 229000 }, { date: "2026-10-30", close: 225000 }]);
    expect(calculateReturns([...result.bars].reverse())["1d"]).toBeCloseTo(1.77777778);
  });
  it("KRX 필드 결측·오류값에 통합 종가로 대체하지 않고 중복·불완전 페이지를 거절한다", () => {
    for (const value of [undefined, null, "", "N/A", "0", -1]) expect(() => parseKrxDailyPage({ hasNext: false, items: [{ tradingDateKst: "2026-11-02", closingPrice: "230000", regularMarketClosingPrice: value }] }, "2026-11-02")).toThrow("KRX 정규장 종가 없음");
    const item = { tradingDateKst: "2026-11-02", regularMarketClosingPrice: "229000" };
    expect(() => parseKrxDailyPage({ hasNext: false, items: [item, item] }, "2026-11-02")).toThrow("중복");
    expect(() => parseKrxDailyPage({ hasNext: true, items: [item] }, "2026-11-02")).toThrow("페이지 형식");
  });
  it("3페이지의 과거 비교 가격까지 KRX만 사용하여 여섯 기간 수익률을 계산한다", async () => {
    const items = Array.from({ length: 300 }, (_, i) => ({ tradingDateKst: new Date(Date.UTC(2026, 10, 2) - i * 86400000).toISOString().slice(0, 10), regularMarketClosingPrice: String(1000 - i), closingPrice: String(5000 + i) }));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => {
      const index = Number(new URL(String(url)).searchParams.get("index"));
      return Response.json({ hasNext: true, items: items.slice(index * 100, (index + 1) * 100) });
    });
    const bars = await fetchKrxDailyCloses("005930", "2026-11-02", fetcher);
    expect(bars).toHaveLength(253);
    expect(bars.at(-1)?.close).toBe(1000);
    for (const period of returnPeriods) expect(calculateReturns(bars)[period.id]).toBeCloseTo((1000 / (1000 - period.days) - 1) * 100);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const duplicate = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ hasNext: true, items: items.slice(0, 100) }));
    await expect(fetchKrxDailyCloses("005930", "2026-11-02", duplicate)).rejects.toThrow("페이지 중복");
  });
  it("신규상장 전 0원 행은 기간 위치를 유지하는 결측으로 남기고 최신 종가의 결측은 거절한다", async () => {
    const payload = { hasNext: false, items: [
      { tradingDateKst: "2026-11-02", regularMarketClosingPrice: "110", closingPrice: "120" },
      { tradingDateKst: "2026-10-30", regularMarketClosingPrice: "0", closingPrice: "0", tradingVolume: "0" },
      { tradingDateKst: "2026-10-29", regularMarketClosingPrice: "100", closingPrice: "105" },
    ] };
    const bars = await fetchKrxDailyCloses("0126Z0", "2026-11-02", vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload)));
    expect(bars).toHaveLength(3);
    expect(bars[1].close).toBeNull();
    expect(calculateReturns(bars)["1d"]).toBeNull();
    await expect(fetchKrxDailyCloses("0126Z0", "2026-10-30", vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload)))).rejects.toThrow("KRX 정규장 종가 없음");
  });
  it("미너비니·차트용 KRX OHLCV에서 정지 봉과 신규상장 전 행을 구분하고 고저가를 검증한다", async () => {
    const payload = { hasNext: false, items: [
      { tradingDateKst: "2026-11-02", regularMarketClosingPrice: "110", closingPrice: "119", openingPrice: "105", highPrice: "120", lowPrice: "100", tradingVolume: "500" },
      { tradingDateKst: "2026-10-30", regularMarketClosingPrice: "100", closingPrice: "100", openingPrice: "0", highPrice: "0", lowPrice: "0", tradingVolume: "0" },
      { tradingDateKst: "2026-10-29", regularMarketClosingPrice: "0", closingPrice: "0", openingPrice: "0", highPrice: "0", lowPrice: "0", tradingVolume: "0" },
    ] };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload));
    const bars = await fetchKrxDailyBars("005930", "2026-11-02", fetcher);
    expect(bars).toEqual([
      { date: "2026-10-30", open: 100, high: 100, low: 100, close: 100, volume: 0 },
      { date: "2026-11-02", open: 105, high: 120, low: 100, close: 110, volume: 500 },
    ]);
    payload.items[0].highPrice = "109";
    await expect(fetchKrxDailyBars("005930", "2026-11-02", fetcher)).rejects.toThrow("고저가 오류");
  });
});
