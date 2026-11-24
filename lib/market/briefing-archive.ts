import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const briefingIdPattern = /^(daily|weekly)-\d{4}-\d{2}-\d{2}$/;
type Entry = { id: string; report: Record<string, unknown> };
const deletionName = (id: string) => `deleted-${id}.json`;

export function briefingDirectories(root = process.cwd()) {
  return {
    local: path.join(root, "output", "briefing-auto"),
    shared: path.join(root, "public", "data", "briefing-archive"),
  };
}

export async function deletedBriefingIds(...dirs: string[]) {
  const states = new Map<string, boolean>();
  const markers = await Promise.all(dirs.map(async dir => {
    const files = await fs.readdir(dir).catch(error => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    return Promise.all(files.filter(file => /^deleted-(daily|weekly)-\d{4}-\d{2}-\d{2}\.json$/.test(file)).map(async file => {
      const id = file.slice(8, -5);
      const raw = await fs.readFile(path.join(dir, file), "utf8").catch(error => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (raw == null) return null;
      try {
        const data = JSON.parse(raw);
        return [id, !(data?.id === id && data.restored === true)] as const;
      } catch {
        return [id, true] as const;
      }
    }));
  }));
  for (const marker of markers.flat()) {
    if (marker && !states.has(marker[0])) states.set(...marker);
  }
  return new Set([...states].filter(([, deleted]) => deleted).map(([id]) => id));
}

export async function writeBriefingDeletionState(dir: string, id: string, restored = false) {
  if (!briefingIdPattern.test(id)) throw new Error("올바른 브리핑 ID가 아닙니다.");
  await fs.mkdir(dir, { recursive: true });
  const temporary = path.join(dir, `.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify({ id, restored }), { flag: "wx" });
    await fs.rename(temporary, path.join(dir, deletionName(id)));
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

/** The Git-published archive contains a validated snapshot paired with a static PDF. */
export async function readBriefingArchive(dir: string): Promise<Entry[]> {
  let files: string[];
  try { files = await fs.readdir(dir); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  const entries = await Promise.all(files.filter(name => name.endsWith(".json") && briefingIdPattern.test(name.slice(0, -5))).map(async name => {
    try {
      const id = name.slice(0, -5);
      const report = JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
      if (report?.type !== id.split("-")[0] || report?.period?.end !== id.slice(id.indexOf("-") + 1) || !Array.isArray(report?.indices) || !Array.isArray(report?.sectors) || !Array.isArray(report?.flows)) return null;
      return { id, report } as Entry;
    } catch { return null; }
  }));
  return entries.filter((entry): entry is Entry => entry !== null).sort((a, b) => b.id.localeCompare(a.id));
}
