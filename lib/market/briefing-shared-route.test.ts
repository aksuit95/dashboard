import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET as list } from "@/app/api/briefing/automatic/route";
import { GET as pdf } from "@/app/api/briefing/automatic/pdf/route";

describe("shared briefing routes", () => {
  it("serves published snapshots without a local output folder", async () => {
    const previous = process.cwd();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-shared-"));
    try {
      const archive = path.join(dir, "public", "data", "briefing-archive");
      await fs.mkdir(archive, { recursive: true });
      await fs.writeFile(path.join(archive, "weekly-2026-11-13.json"), JSON.stringify({ type: "weekly", period: { end: "2026-11-13" }, indices: [], sectors: [], flows: [] }));
      process.chdir(dir);
      const response = await list();
      expect((await response.json()).reports.map((x: { id: string }) => x.id)).toEqual(["weekly-2026-11-13"]);
      const file = await pdf(new Request("https://example.com/api/briefing/automatic/pdf?id=weekly-2026-11-13"));
      expect(file.status).toBe(307);
      expect(file.headers.get("location")).toBe("/data/briefing-archive/weekly-2026-11-13.pdf");
      expect((await pdf(new Request("https://example.com/api/briefing/automatic/pdf?id=..%2Fsecret"))).status).toBe(400);
    } finally { process.chdir(previous); await fs.rm(dir, { recursive: true, force: true }); }
  });
});
