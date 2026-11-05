import { describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "@/lib/db/client";
import type { InvestorBoard } from "./investor-flow";
import { collectInvestorToss } from "./investor-flow-toss";
import { loadTossMarketFlow } from "./toss-investor-flow";
import { createInvestorKrxWebQuery } from "./investor-flow-krx-web";

vi.mock("./toss-investor-flow", () => ({ loadTossMarketFlow: vi.fn(), loadTossInvestorFlows: vi.fn() }));
vi.mock("./investor-flow-krx-web", () => ({ createInvestorKrxWebQuery: vi.fn() }));
const db = { prepare: () => ({ all: () => [] }) } as unknown as AppDatabase;
const board = { asOf: "2026-11-04" } as InvestorBoard;
const points = ["2026-11-03", "2026-11-04"].map(date => ({ date, individual: 1, foreign: 2, institution: 3 }));

describe("시장 수급 비교 지수", () => {
  it("aligns source KRX dates with all Toss sessions", async () => {
    vi.mocked(loadTossMarketFlow).mockResolvedValue({ market: "KOSPI", asOf: board.asOf, collectedAt: "2026-11-04T16:10:00+09:00", latestUpdatedAt: null, points });
    vi.mocked(createInvestorKrxWebQuery).mockReturnValue(async () => ({ output: [{ TRD_DD: "2026/11/03", CLSPRC_IDX: "4,000" }, { TRD_DD: "2026/11/04", CLSPRC_IDX: "4,100" }] }));
    const result = await collectInvestorToss(db, "kospi200", "index", board);
    expect(result).toMatchObject({ priceError: null, prices: [{ date: "2026-11-03", value: 4000 }, { date: "2026-11-04", value: 4100 }] });
  });
  it("marks a missing index session as a price error instead of connecting across it", async () => {
    vi.mocked(loadTossMarketFlow).mockResolvedValue({ market: "KOSPI", asOf: board.asOf, collectedAt: "2026-11-04T16:10:00+09:00", latestUpdatedAt: null, points });
    vi.mocked(createInvestorKrxWebQuery).mockReturnValue(async () => ({ output: [{ TRD_DD: "2026/11/04", CLSPRC_IDX: "4,100" }] }));
    const result = await collectInvestorToss(db, "kospi200", "index", board);
    expect(result).toMatchObject({ priceError: expect.stringContaining("누락") });
  });
});
