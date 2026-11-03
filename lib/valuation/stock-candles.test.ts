import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/valuation/stocks/candles/route";

afterEach(() => vi.unstubAllGlobals());
describe("밸류에이션 종목 일봉 API", () => {
  it("목록 밖의 코드나 URL 입력은 외부 요청 전에 거절한다", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await GET(new Request("http://localhost/api/valuation/stocks/candles?code=../../other"))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("검증된 OHLCV를 반환하고 잘못된 upstream 응답을 성공으로 캐시하지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('<item data="20261030|100|120|90|110|500"/>')).mockResolvedValueOnce(new Response("not OHLCV"));
    vi.stubGlobal("fetch", fetcher);
    const request = new Request("http://localhost/api/valuation/stocks/candles?code=005930");
    const success = await GET(request);
    expect(success.status).toBe(200);
    expect((await success.json()).bars).toEqual([{ date: "2026-10-30", open: 100, high: 120, low: 90, close: 110, volume: 500 }]);
    const failure = await GET(request);
    expect(failure.status).toBe(502);
    expect(failure.headers.get("Cache-Control")).toBeNull();
  });
});
