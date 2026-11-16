import fs from "node:fs/promises";
import path from "node:path";

export const briefingIdPattern = /^(daily|weekly)-\d{4}-\d{2}-\d{2}$/;
type Entry = { id: string; report: Record<string, unknown> };

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
