import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketLiveClosingSnapshot } from "@/lib/market/market-live";

const date = "2026-11-20";
const baselineDate = "2026-11-19";
const closeStamp = `${date}T15:30:00+09:00`;
const sources = vi.hoisted(() => ({
  fetchStocks: vi.fn(),
  readPublication: vi.fn(),
  readCaps: vi.fn(),
}));

vi.mock("./naver-market-live", () => ({
  fetchNaverLiveStocks: sources.fetchStocks,
  fetchNaverLiveIndex: async () => ({ price: null, asOf: null, points: [] }),
}));
vi.mock("./market-live-publication", () => ({ readMarketLivePublication: sources.readPublication }));
vi.mock("./sector-publication", () => ({ readSectorPublication: async () => null }));
vi.mock("./minervini", () => ({
  fetchIndexMembers: async (universe: string) => universe === "kospi200"
    ? ["005930", "000660", "035420", "035720"].map(code => ({ code, name: code })) : [],
}));
vi.mock("@/lib/valuation/market-caps", () => ({ readMarketCaps: sources.readCaps }));
vi.mock("./krx-openapi", () => ({
  requestKrxOpenApi: async (service: string) => service === "sto/stk_bydd_trd"
    ? ["005930", "000660", "035420", "035720"].map(code => ({
      BAS_DD: "20261120", ISU_CD: code, MKT_NM: "KOSPI", TDD_CLSPRC: "110",
    })) : [],
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("VERCEL", "1");
  const codes = ["005930", "000660", "035420", "035720"];
  sources.readCaps.mockResolvedValue({
    asOf: baselineDate,
    closes: Object.fromEntries(codes.map(code => [code, 100])),
    values: Object.fromEntries(codes.map(code => [code, 100_000])),
    securities: Object.fromEntries(codes.map(code => [code, { market: "KOSPI" }])),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("regular-session closing stock strength", () => {
  it("uses the closing print and keeps stale, after-hours, and mismatched prices out of the ranking", async () => {
    vi.setSystemTime(new Date(`${date}T15:31:00+09:00`));
    sources.fetchStocks.mockResolvedValue({ failedBatches: 0, quotes: [
      { code: "005930", price: 110, turnover: 5_000, asOf: closeStamp },
      { code: "000660", price: 110, turnover: 8_000, asOf: `${date}T15:29:59+09:00` },
      { code: "035420", price: 110, turnover: 9_000, asOf: `${date}T15:40:00+09:00` },
      { code: "035720", price: 112, turnover: 7_000, asOf: closeStamp },
    ] });
    const { loadMarketLiveBoard } = await import("./market-live");
    const result = await loadMarketLiveBoard();

    expect(result.state).toBe("closed");
    expect(result.buyStrengthLeaders).toEqual([expect.objectContaining({
      code: "005930", price: 110, turnover: 5_000, marketCap: 100_000, buyStrengthPct: 5,
      asOf: new Date(closeStamp).toISOString(),
    })]);
    expect(result.leaders).toHaveLength(4);
    expect(result.closingSnapshot?.stocks.map(stock => stock.code)).toEqual(["005930"]);
  });

  it("reuses the verified snapshot and its previous-session capitalization on a non-trading day", async () => {
    vi.setSystemTime(new Date("2026-11-21T10:00:00+09:00"));
    sources.readCaps.mockResolvedValue(null);
    const closingSnapshot: MarketLiveClosingSnapshot = {
      date, baselineDate, basis: "KRX_REGULAR_CLOSE", collectedAt: `${date}T15:31:00+09:00`,
      stocks: [{ code: "005930", price: 110, turnover: 9_000, baselineClose: 100, marketCap: 100_000 }],
    };
    sources.readPublication.mockReturnValue({ closingSnapshot });
    const { loadMarketLiveBoard } = await import("./market-live");
    const result = await loadMarketLiveBoard();

    expect(result).toMatchObject({ state: "closed", date, baselineDate });
    expect(result.buyStrengthLeaders?.[0]).toMatchObject({ code: "005930", buyStrengthPct: 9 });
    expect(sources.fetchStocks).not.toHaveBeenCalled();
  });

  it("keeps the closed-market toggle available when collection is missing", async () => {
    vi.setSystemTime(new Date(`${date}T19:00:00+09:00`));
    const { loadMarketLiveBoard } = await import("./market-live");
    const result = await loadMarketLiveBoard();
    expect(result.buyStrengthLeaders).toEqual([]);
    expect(result.leaders).toHaveLength(4);
    expect(sources.fetchStocks).not.toHaveBeenCalled();
  });
});
