import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readBriefingArchive } from "./briefing-archive";

describe("shared briefing archive", () => {
  it("reads matching snapshots and ignores invalid names and dates", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-archive-"));
    try {
      const data = { type: "weekly", period: { end: "2026-11-13" }, indices: [], sectors: [], flows: [] };
      await fs.writeFile(path.join(dir, "weekly-2026-11-13.json"), JSON.stringify(data));
      await fs.writeFile(path.join(dir, "weekly-2026-11-20.json"), JSON.stringify(data));
      await fs.writeFile(path.join(dir, "other.json"), JSON.stringify(data));
      expect((await readBriefingArchive(dir)).map(x => x.id)).toEqual(["weekly-2026-11-13"]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
  it("returns an empty list if there is no archive", async () => {
    expect(await readBriefingArchive(path.join(os.tmpdir(), "nonexistent-market-briefing-archive-623527"))).toEqual([]);
  });
});
