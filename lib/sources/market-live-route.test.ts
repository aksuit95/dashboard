import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/market-live/route";
import type { MarketLiveBoardData } from "@/lib/market/market-live";
import { loadMarketLiveBoard } from "./market-live";

vi.mock("./market-live", () => ({ loadMarketLiveBoard: vi.fn() }));

const date = "2026-11-20";
const asOf = `${date}T14:00:00+09:00`;
const board: MarketLiveBoardData = {
  state: "open", date, baselineDate: "2026-11-19", note: null, collectedAt: asOf,
  indexes: [], sectors: [], leaders: [], rotationStocks: [], warnings: [],
  breadth: { up: 1, flat: 0, down: 1, compared: 2, total: 2 },
  sectorStocks: [
    { code: "005930", name: "삼성전자", market: "KOSPI", sector: "반도체", price: 70_000, changePct: 1, asOf },
    { code: "005380", name: "현대차", market: "KOSPI", sector: "자동차", price: 200_000, changePct: -1, asOf },
  ],
};
const request = (query = "") => new Request(`https://dashboard.example/api/market-live${query}`);

beforeEach(() => {
  vi.stubEnv("VERCEL", "1");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(asOf));
  vi.mocked(loadMarketLiveBoard).mockReset().mockResolvedValue(board);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("shared KRX intraday response", () => {
  it("returns all sector constituents in one cacheable snapshot", async () => {
    const response = await GET(request());
    const value = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("public, s-maxage=15");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(value.sectorStocks).toEqual(board.sectorStocks);
    expect(value).not.toHaveProperty("rotationStocks");
    expect(value).not.toHaveProperty("closingSnapshot");
  });

  it("caps the cache lifetime at the scheduled close", async () => {
    vi.mocked(loadMarketLiveBoard).mockResolvedValue({ ...board, state: "auction" });
    vi.mocked(Date.now).mockReturnValue(Date.parse(`${date}T15:29:55+09:00`));
    expect((await GET(request())).headers.get("vercel-cdn-cache-control")).toBe("public, s-maxage=5");

    vi.mocked(Date.now).mockReturnValue(Date.parse(`${date}T15:30:00+09:00`));
    expect((await GET(request())).headers.get("cache-control")).toBe("no-store");
  });

  it("keeps local and closed responses uncached", async () => {
    vi.stubEnv("VERCEL", "");
    expect((await GET(request())).headers.get("cache-control")).toBe("no-store");
    vi.stubEnv("VERCEL", "1");
    vi.mocked(loadMarketLiveBoard).mockResolvedValue({ ...board, state: "closed" });
    expect((await GET(request())).headers.get("vercel-cdn-cache-control")).toBeNull();
  });

  it("rejects alternate query keys before requesting market data", async () => {
    expect((await GET(request("?sector=semiconductors"))).status).toBe(400);
    expect(vi.mocked(loadMarketLiveBoard)).not.toHaveBeenCalled();
  });
});
