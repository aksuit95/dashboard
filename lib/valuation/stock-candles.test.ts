import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/valuation/stocks/candles/route";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T00:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const payload = () => ({ hasNext: false, items: [
  { tradingDateKst: "2026-11-03", regularMarketClosingPrice: "120", closingPrice: "124", openingPrice: "115", highPrice: "125", lowPrice: "115", tradingVolume: "600" },
  { tradingDateKst: "2026-11-02", regularMarketClosingPrice: "110", closingPrice: "119", openingPrice: "100", highPrice: "120", lowPrice: "90", tradingVolume: "500" },
  { tradingDateKst: "2026-10-30", regularMarketClosingPrice: "100", closingPrice: "109", openingPrice: "95", highPrice: "110", lowPrice: "90", tradingVolume: "400" },
] });
const request = () => new Request("http://localhost/api/valuation/stocks/candles?code=005930&basis=krx-1530");
describe("밸류에이션 종목 일봉 API", () => {
  it("목록 밖의 코드나 URL 입력은 외부 요청 전에 거절한다", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await GET(new Request("http://localhost/api/valuation/stocks/candles?code=../../other"))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("KRX 정규장 OHLCV만 반환하고 장중 봉과 시간외 종가를 포함하지 않는다", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json(payload())); vi.stubGlobal("fetch", fetcher);
    const success = await GET(request());
    expect(success.status).toBe(200);
    const data = await success.json();
    expect(data).toMatchObject({ code: "005930", asOf: "2026-11-02", priceBasis: "KRX_REGULAR_CLOSE" });
    expect(data.bars.at(-1)).toEqual({ date: "2026-11-02", open: 100, high: 120, low: 90, close: 110, volume: 500 });
    expect(data.bars).toHaveLength(2);
    expect(String(fetcher.mock.calls[0][0])).toContain("daily-prices/paged");
  });
  it("16:00 이후에 새 완료 거래일을 반영하고 주말은 직전 거래일을 사용한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(payload())));
    vi.setSystemTime(new Date("2026-11-03T07:00:00Z"));
    expect((await (await GET(request())).json()).bars.at(-1).close).toBe(120);
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    expect((await (await GET(request())).json()).asOf).toBe("2026-10-30");
  });
  it("정규장 종가 누락·OHLCV 오류를 시간외 값으로 대체하지 않고 502로 반환한다", async () => {
    const data = payload(); delete (data.items[1] as Partial<typeof data.items[number]>).regularMarketClosingPrice;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(data)));
    const failure = await GET(request());
    expect(failure.status).toBe(502);
    expect(failure.headers.get("Cache-Control")).toBeNull();
    data.items[1].regularMarketClosingPrice = "110"; data.items[1].highPrice = "99";
    expect((await GET(request())).status).toBe(502);
  });
});
