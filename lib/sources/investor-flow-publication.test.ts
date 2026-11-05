import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "@/lib/db/client";
import { collectInvestorDaily } from "./investor-flow-daily";
import { exportInvestorPublication, readPublishedInvestorDaily, validateInvestorPublication } from "./investor-flow-publication";
import { loadInvestorBoard } from "./investor-flow";
import { collectInvestorToss } from "./investor-flow-toss";

vi.mock("./investor-flow", () => ({ loadInvestorBoard: vi.fn() }));
vi.mock("./investor-flow-toss", () => ({ collectInvestorToss: vi.fn() }));
let directory: string, file: string, db: AppDatabase;
const now = new Date("2026-11-03T16:00:00+09:00");
beforeEach(async () => {
  vi.resetAllMocks();
  const root = path.join(process.cwd(), "tmp");
  await fs.mkdir(root, { recursive: true });
  directory = await fs.mkdtemp(path.join(root, "investor-publication-"));
  file = path.join(directory, "board.json");
  db = openDatabase(":memory:");
  vi.mocked(loadInvestorBoard).mockImplementation(async (_db, universe, view) => ({
    version: 1, universe, view, asOf: "2026-11-03", fetchedAt: now.toISOString(),
    priceBasis: "KRX_REGULAR_CLOSE", equity: null, equityError: null,
  }));
  vi.mocked(collectInvestorToss).mockImplementation(async (_db, _universe, _view, board) => ({
    market: "KOSPI", asOf: board.asOf, collectedAt: board.fetchedAt, latestUpdatedAt: null,
    points: [{ date: board.asOf, individual: 1, foreign: -1, institution: 0 }], prices: [], priceError: null,
  }));
});
afterEach(async () => { db.close(); await fs.rm(directory, { recursive: true, force: true }); });

describe("investor flow Actions publication", () => {
  it("exports all tabs and serves a deployment from JSON without any collection", async () => {
    expect((await exportInvestorPublication(db, now, file)).changed).toBe(true);
    const saved = await readPublishedInvestorDaily("kospi200", "index", now, undefined, file);
    expect(saved.board.asOf).toBe("2026-11-03");
    expect(saved.toss.asOf).toBe(saved.board.asOf);
    expect(loadInvestorBoard).toHaveBeenCalledTimes(4);
    expect(collectInvestorToss).toHaveBeenCalledTimes(4);
  });
  it("restores claims on a new Actions runner and avoids same-day recollection", async () => {
    await exportInvestorPublication(db, now, file);
    const original = await fs.readFile(file, "utf8");
    db.close(); db = openDatabase(":memory:");
    expect((await exportInvestorPublication(db, now, file)).changed).toBe(false);
    expect(await fs.readFile(file, "utf8")).toBe(original);
    expect(loadInvestorBoard).toHaveBeenCalledTimes(4);
  });
  it("restores a published recovery over an older failed local snapshot", async () => {
    await exportInvestorPublication(db, now, file);
    db.prepare("UPDATE investor_flow_daily_runs SET error = ?").run("old failure");
    db.prepare("UPDATE investor_flow_daily_snapshots SET error = ?, toss = NULL").run("old failure");
    expect((await exportInvestorPublication(db, now, file)).ok).toBe(true);
    expect((await readPublishedInvestorDaily("kospi200", "stocks", now, undefined, file)).error).toBeNull();
    expect(collectInvestorToss).toHaveBeenCalledTimes(4);
  });
  it("publishes failed attempts too, preventing retries on fresh runners", async () => {
    vi.mocked(collectInvestorToss).mockRejectedValue(new Error("미발표"));
    expect((await exportInvestorPublication(db, now, file)).ok).toBe(false);
    db.close(); db = openDatabase(":memory:");
    expect((await exportInvestorPublication(db, now, file)).ok).toBe(false);
    expect(collectInvestorToss).toHaveBeenCalledTimes(4);
    expect((await readPublishedInvestorDaily("kosdaq150", "stocks", now, undefined, file)).error).toBe("미발표");
  });
  it("rejects incompatible price bases and does not overwrite published data", async () => {
    await exportInvestorPublication(db, now, file);
    const original = await fs.readFile(file, "utf8");
    const data = JSON.parse(original);
    const board = JSON.parse(data.snapshots[0].board);
    board.priceBasis = "INTEGRATED_CLOSE";
    data.snapshots[0].board = JSON.stringify(board);
    expect(() => validateInvestorPublication(data)).toThrow("KRX");
    expect(await fs.readFile(file, "utf8")).toBe(original);
  });
  it("does not publish a new empty file before the collection boundary", async () => {
    const before = new Date("2026-11-03T15:59:00+09:00");
    expect((await exportInvestorPublication(db, before, file, collectInvestorDaily)).changed).toBe(false);
    await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(loadInvestorBoard).not.toHaveBeenCalled();
  });
  it("uses the previous complete session when today's quotes failed, preserving its date", async () => {
    await exportInvestorPublication(db, now, file);
    const publication = JSON.parse(await fs.readFile(file, "utf8"));
    const older = publication.snapshots.find((s: { universe: string; view: string }) => s.universe === "kospi200" && s.view === "index");
    const oldBoard = JSON.parse(older.board); oldBoard.equity = { sessions: ["2026-11-03"] }; older.board = JSON.stringify(oldBoard);
    const newerBoard = { ...oldBoard, asOf: "2026-11-04", equity: null };
    publication.runs.unshift({ as_of: "2026-11-04", started_at: "2026-11-04T07:00:00Z", finished_at: "2026-11-04T07:01:00Z", error: "KRX 미발표" });
    publication.snapshots.push({ ...older, as_of: "2026-11-04", board: JSON.stringify(newerBoard), toss: null, error: "KRX 미발표" });
    await fs.writeFile(file, JSON.stringify(publication));
    const result = await readPublishedInvestorDaily("kospi200", "index", new Date("2026-11-04T16:00:00+09:00"), undefined, file);
    expect(result).toMatchObject({ expected: "2026-11-04", board: { asOf: "2026-11-03" } });
    expect((await readPublishedInvestorDaily("kospi200", "index", new Date("2026-11-04T16:00:00+09:00"), "2026-11-03", file)).toss.asOf).toBe("2026-11-03");
  });
});
