import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportMinerviniPublication, readPublishedMinervini } from "./minervini-publication";
import type { fetchMinerviniSnapshot } from "./minervini";

let dir: string, file: string;
const now = new Date("2026-11-03T16:00:00+09:00");
const collect: typeof fetchMinerviniSnapshot = async (asOf, _fetch, timestamp, universe = "kospi200") => {
  const count = universe === "kospi200" ? 200 : 150;
  return { version: 4, priceBasis: "KRX_REGULAR_CLOSE", universe, asOf, fetchedAt: timestamp!.toISOString(), membershipAt: timestamp!.toISOString(), universeSize: count, rankedSize: count,
    rows: Array.from({ length: count }, (_, i) => ({ code: String(i).padStart(6, "0") })) as Awaited<ReturnType<typeof fetchMinerviniSnapshot>>["rows"] };
};
beforeEach(async () => { const root = path.join(process.cwd(), "tmp"); await fs.mkdir(root, { recursive: true }); dir = await fs.mkdtemp(path.join(root, "minervini-publication-")); file = path.join(dir, "board.json"); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe("published Minervini snapshots", () => {
  it("collects both universes and reuses a complete session", async () => {
    const spy = vi.fn(collect);
    expect(await exportMinerviniPublication(file, now, spy)).toMatchObject({ ok: true, changed: true, asOf: "2026-11-03" });
    expect(await exportMinerviniPublication(file, now, spy)).toMatchObject({ ok: true, changed: false });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await readPublishedMinervini("kosdaq150", now, file)).toMatchObject({ stale: false, snapshot: { asOf: "2026-11-03", priceBasis: "KRX_REGULAR_CLOSE" } });
  });
  it("retains the last result for a failed universe and publishes the other", async () => {
    await exportMinerviniPublication(file, new Date("2026-11-02T16:00:00+09:00"), collect);
    const failing: typeof collect = (asOf, f, time, universe) => universe === "kospi200" ? Promise.reject(new Error("실패")) : collect(asOf, f, time, universe);
    expect(await exportMinerviniPublication(file, now, failing)).toMatchObject({ ok: false, changed: true });
    expect(await readPublishedMinervini("kospi200", now, file)).toMatchObject({ stale: true, snapshot: { asOf: "2026-11-02" } });
    expect(await readPublishedMinervini("kosdaq150", now, file)).toMatchObject({ stale: false, snapshot: { asOf: "2026-11-03" } });
  });
  it("does not show a future close before 16:00", async () => {
    await exportMinerviniPublication(file, now, collect);
    expect(await readPublishedMinervini("kospi200", new Date("2026-11-03T15:59:00+09:00"), file)).toMatchObject({ stale: true, snapshot: null, expectedDate: "2026-11-02" });
  });
});
