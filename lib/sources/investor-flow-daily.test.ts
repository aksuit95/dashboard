import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "@/lib/db/client";
import { collectInvestorDaily, readInvestorDaily } from "./investor-flow-daily";
import { loadInvestorBoard } from "./investor-flow";
import { collectInvestorToss } from "./investor-flow-toss";

vi.mock("./investor-flow", () => ({ loadInvestorBoard: vi.fn() }));
vi.mock("./investor-flow-toss", () => ({ collectInvestorToss: vi.fn() }));
let db: AppDatabase;
const at = (clock: string) => new Date(`2026-11-03T${clock}:00+09:00`);
beforeEach(() => {
  vi.resetAllMocks();
  db = openDatabase(":memory:");
  vi.mocked(loadInvestorBoard).mockImplementation(async (_db, universe, view, now) => ({
    version: 1, universe, view, asOf: "2026-11-03", fetchedAt: now!.toISOString(),
    priceBasis: "KRX_REGULAR_CLOSE", equity: null, equityError: null,
  }));
  vi.mocked(collectInvestorToss).mockImplementation(async (_db, _universe, _view, board) => ({
    market: "KOSPI", asOf: board.asOf, collectedAt: board.fetchedAt, latestUpdatedAt: null,
    points: [{ date: board.asOf, individual: 1, foreign: -1, institution: 0 }], prices: [], priceError: null,
  }));
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); });

describe("scheduled investor flow snapshots", () => {
  it("does not collect before 16:00, on weekends or holidays", async () => {
    for (const now of [at("15:59"), new Date("2026-11-07T16:00:00+09:00"), new Date("2026-10-09T16:00:00+09:00")]) {
      expect((await collectInvestorDaily(db, now)).skipped).toBe(true);
    }
    expect(loadInvestorBoard).not.toHaveBeenCalled();
  });
  it("collects all four tabs once, including concurrent and repeated invocations", async () => {
    await Promise.all([collectInvestorDaily(db, at("16:00")), collectInvestorDaily(db, at("16:00"))]);
    await collectInvestorDaily(db, at("18:00"));
    expect(loadInvestorBoard).toHaveBeenCalledTimes(4);
    expect(collectInvestorToss).toHaveBeenCalledTimes(4);
    const saved = readInvestorDaily(db, "kospi200", "index", at("18:00"));
    expect(saved.board.asOf).toBe("2026-11-03");
    expect(saved.board.priceBasis).toBe("KRX_REGULAR_CLOSE");
    expect(saved.toss.asOf).toBe(saved.board.asOf);
  });
  it("can explicitly recover the last session while recording the actual collection time", async () => {
    const morning = new Date("2026-11-04T09:30:00+09:00");
    expect((await collectInvestorDaily(db, morning, true, true)).asOf).toBe("2026-11-03");
    expect(loadInvestorBoard).toHaveBeenCalledTimes(4);
    const run = db.prepare("SELECT started_at FROM investor_flow_daily_runs WHERE as_of = ?").get("2026-11-03") as { started_at: string };
    expect(run.started_at).toBe(morning.toISOString());
  });
  it("reads saved results without invoking sources; no snapshot means no live fallback", async () => {
    expect(() => readInvestorDaily(db, "kospi200", "index", at("16:00"))).toThrow("저장된 수급");
    expect(loadInvestorBoard).not.toHaveBeenCalled();
    await collectInvestorDaily(db, at("16:00"));
    const nextMorning = new Date("2026-11-04T10:00:00+09:00");
    expect(readInvestorDaily(db, "kospi200", "index", nextMorning).board.asOf).toBe("2026-11-03");
    expect(readInvestorDaily(db, "kospi200", "index", new Date("2026-11-04T16:00:00+09:00")).expected).toBe("2026-11-04");
    expect(() => readInvestorDaily(db, "kospi200", "index", at("18:00"), "2026-11-02")).toThrow();
    expect(loadInvestorBoard).toHaveBeenCalledTimes(4);
  });
  it("persists failures and does not retry on the same day", async () => {
    vi.mocked(collectInvestorToss).mockRejectedValue(new Error("미발표"));
    expect((await collectInvestorDaily(db, at("16:00"))).ok).toBe(false);
    expect((await collectInvestorDaily(db, at("17:00"))).ok).toBe(false);
    expect(readInvestorDaily(db, "kospi200", "stocks", at("17:00"))).toMatchObject({ toss: null, error: "미발표" });
    expect(collectInvestorToss).toHaveBeenCalledTimes(4);
  });
  it("allows a scheduled retry after failure and does not repeat successful tabs", async () => {
    vi.mocked(collectInvestorToss).mockRejectedValueOnce(new Error("미발표"));
    expect((await collectInvestorDaily(db, at("16:00"))).ok).toBe(false);
    expect(collectInvestorToss).toHaveBeenCalledTimes(4);
    expect((await collectInvestorDaily(db, at("17:00"), true)).ok).toBe(true);
    expect(collectInvestorToss).toHaveBeenCalledTimes(5);
    expect((await collectInvestorDaily(db, at("18:00"), true)).skipped).toBe(true);
    expect(collectInvestorToss).toHaveBeenCalledTimes(5);
  });
  it("rejects unauthenticated scheduled calls", async () => {
    const { GET } = await import("@/app/api/cron/investor-flow/route");
    vi.stubEnv("CRON_SECRET", "test-only");
    expect((await GET(new Request("http://localhost/api/cron/investor-flow"))).status).toBe(401);
    expect(loadInvestorBoard).not.toHaveBeenCalled();
  });
});
