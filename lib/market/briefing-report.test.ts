import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { requestKrxOpenApi } from "@/lib/sources/krx-openapi";
import { buildBriefing } from "./briefing-report";

vi.mock("@/lib/sources/krx-openapi", () => ({ requestKrxOpenApi: vi.fn() }));

async function withPublishedIndex(asOf: string, test: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-index-"));
  const dir = path.join(root, "public", "data", "market-indicators-live");
  try {
    await fs.mkdir(dir, { recursive: true });
    for (const id of ["kospi", "kosdaq"]) {
      await fs.writeFile(path.join(dir, id + ".json"), JSON.stringify([{ date: asOf, value: 100 }]));
      await fs.writeFile(path.join(dir, id + ".meta.json"), JSON.stringify({
        asOf, status: "ok", source: "KRX 정보데이터시스템", basis: "KRX 정규장 15:30 KST", fetchedAt: asOf + "T08:00:00Z",
      }));
    }
    vi.mocked(requestKrxOpenApi).mockReset();
    await test(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

describe("briefing index closes", () => {
  it("keeps the verified comparison close and queries only the missing trading date", async () => {
    await withPublishedIndex("2026-11-20", async root => {
      vi.mocked(requestKrxOpenApi).mockImplementation(async service => service === "idx/kospi_dd_trd"
        ? [{ BAS_DD: "20261123", IDX_NM: "코스피 200", CLSPRC_IDX: "99" }, { BAS_DD: "20261123", IDX_NM: "코스피", CLSPRC_IDX: "118.50" }]
        : [{ BAS_DD: "20261121", IDX_NM: "코스닥", CLSPRC_IDX: "120" }]);
      const report = await buildBriefing("daily", "2026-11-23", root, new Date("2026-11-24T08:00:00+09:00"));
      expect(report.indices[0]).toMatchObject({ close: 118.5, change: 18.5, error: null });
      expect(report.indices[1]).toMatchObject({ close: null, error: expect.stringContaining("2026-11-23") });
      expect(requestKrxOpenApi).toHaveBeenCalledTimes(2);
      expect(requestKrxOpenApi).toHaveBeenCalledWith("idx/kospi_dd_trd", "20261123");
      expect(requestKrxOpenApi).toHaveBeenCalledWith("idx/kosdaq_dd_trd", "20261123");
    });
  });

  it("requires the verified 16:30 source for the delayed session", async () => {
    await withPublishedIndex("2026-11-18", async root => {
      const report = await buildBriefing("daily", "2026-11-19", root, new Date("2026-11-19T17:00:00+09:00"));
      expect(report.indices.every(index => index.error?.includes("16:30"))).toBe(true);
      expect(requestKrxOpenApi).not.toHaveBeenCalled();
    });
  });
});
