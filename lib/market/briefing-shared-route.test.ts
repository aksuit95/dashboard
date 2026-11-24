import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DELETE as remove, GET as list, POST as recreate } from "@/app/api/briefing/automatic/route";
import { GET as pdf } from "@/app/api/briefing/automatic/pdf/route";
import { briefingDirectories, writeBriefingDeletionState } from "./briefing-archive";
import { buildLocalBriefing, writeBriefingFiles } from "./briefing-generation";

vi.mock("./briefing-generation", () => ({ buildLocalBriefing: vi.fn(), writeBriefingFiles: vi.fn() }));

describe("shared briefing routes", () => {
  it("serves published snapshots without a local output folder", async () => {
    const previous = process.cwd();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-shared-"));
    try {
      const archive = path.join(dir, "public", "data", "briefing-archive");
      await fs.mkdir(archive, { recursive: true });
      await fs.writeFile(path.join(archive, "weekly-2026-11-13.json"), JSON.stringify({ type: "weekly", period: { end: "2026-11-13" }, indices: [], sectors: [], flows: [] }));
      process.chdir(dir);
      const response = await list(new Request("https://example.com/api/briefing/automatic"));
      expect((await response.json()).reports.map((x: { id: string }) => x.id)).toEqual(["weekly-2026-11-13"]);
      const file = await pdf(new Request("https://example.com/api/briefing/automatic/pdf?id=weekly-2026-11-13"));
      expect(file.status).toBe(307);
      expect(file.headers.get("location")).toBe("/data/briefing-archive/weekly-2026-11-13.pdf");
      expect((await pdf(new Request("https://example.com/api/briefing/automatic/pdf?id=..%2Fsecret"))).status).toBe(400);
    } finally { process.chdir(previous); await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("deletes only the selected briefing from a loopback-bound development server", async () => {
    const previous = process.cwd();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-delete-"));
    const { local, shared } = briefingDirectories(dir);
    const origin = "http://127.0.0.1:3000";
    const url = "http://localhost:3000/api/briefing/automatic";
    const id = "weekly-2026-11-20";
    const request = (source = origin, selected = id) => new Request(`${url}?id=${selected}`, {
      method: "DELETE", headers: { host: "127.0.0.1:3000", origin: source },
    });
    vi.stubEnv("__NEXT_PRIVATE_ORIGIN", origin);
    vi.stubEnv("VERCEL", "");
    try {
      await Promise.all([fs.mkdir(local, { recursive: true }), fs.mkdir(shared, { recursive: true })]);
      const report = JSON.stringify({ type: "weekly", period: { end: "2026-11-20" }, indices: [], sectors: [], flows: [] });
      await fs.writeFile(path.join(local, `${id}.json`), report);
      await fs.writeFile(path.join(local, `${id}.pdf`), "%PDF-");
      await fs.writeFile(path.join(shared, `${id}.json`), report);
      await fs.writeFile(path.join(shared, "daily-2026-11-20.json"), JSON.stringify({ type: "daily", period: { end: "2026-11-20" }, indices: [], sectors: [], flows: [] }));
      process.chdir(dir);
      const before = await (await list(request())).json();
      expect(before.canDelete).toBe(true);
      expect(before.reports).toHaveLength(2);
      expect((await remove(request("https://example.com"))).status).toBe(403);
      expect((await remove(request(origin, "..%2Fsecret"))).status).toBe(400);
      vi.stubEnv("__NEXT_PRIVATE_ORIGIN", "http://localhost:3000");
      expect((await remove(request())).status).toBe(403);
      vi.stubEnv("__NEXT_PRIVATE_ORIGIN", origin);
      vi.stubEnv("VERCEL", "1");
      expect((await remove(request())).status).toBe(403);
      vi.stubEnv("VERCEL", "");
      expect((await remove(request())).status).toBe(204);
      expect((await remove(request())).status).toBe(204);
      expect((await (await list(request())).json()).reports.map((item: { id: string }) => item.id)).toEqual(["daily-2026-11-20"]);
      expect((await pdf(new Request(`${url}/pdf?id=${id}`))).status).toBe(404);
      await expect(fs.access(path.join(local, `${id}.pdf`))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(fs.access(path.join(local, `deleted-${id}.json`))).resolves.toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      process.chdir(previous);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps a failed rebuild deleted and restores the report after a successful rebuild", async () => {
    const previous = process.cwd();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-recreate-"));
    const { local, shared } = briefingDirectories(dir);
    const id = "weekly-2026-11-20";
    const endpoint = "http://localhost:3000/api/briefing/automatic";
    const url = endpoint + "?id=" + id;
    const request = (method: string, origin = "http://127.0.0.1:3000") =>
      new Request(url, { method, headers: { host: "127.0.0.1:3000", origin } });
    const report = {
      type: "weekly" as const, createdAt: "2026-11-24T00:00:00Z", indices: [], sectors: [], flows: [],
      period: { selected: "2026-11-20", start: "2026-11-16", end: "2026-11-20", base: "2026-11-13", days: ["2026-11-20"], weekEnd: "2026-11-22" },
    };
    vi.stubEnv("__NEXT_PRIVATE_ORIGIN", "http://127.0.0.1:3000");
    vi.stubEnv("VERCEL", "");
    try {
      process.chdir(dir);
      await writeBriefingDeletionState(shared, id);
      await writeBriefingDeletionState(local, id);
      vi.mocked(buildLocalBriefing).mockResolvedValue(report);
      vi.mocked(writeBriefingFiles).mockRejectedValueOnce(new Error("필수 KRX 지수 자료 대기")).mockImplementationOnce(async () => {
        await fs.writeFile(path.join(local, id + ".json"), JSON.stringify(report));
        await fs.writeFile(path.join(local, id + ".pdf"), "%PDF-");
        return true;
      });
      expect((await recreate(request("POST", "https://example.com"))).status).toBe(403);
      expect((await recreate(request("POST"))).status).toBe(500);
      expect((await (await list(request("GET"))).json()).deleted).toEqual([id]);
      expect((await recreate(request("POST"))).status).toBe(200);
      expect(await (await list(request("GET"))).json()).toMatchObject({ reports: [{ id }], deleted: [] });
      expect((await pdf(new Request(endpoint + "/pdf?id=" + id))).status).toBe(200);
      expect((await remove(request("DELETE"))).status).toBe(204);
      expect((await (await list(request("GET"))).json()).deleted).toEqual([id]);
    } finally {
      vi.unstubAllEnvs();
      vi.resetAllMocks();
      process.chdir(previous);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
