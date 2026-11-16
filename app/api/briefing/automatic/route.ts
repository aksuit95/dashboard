import fs from "node:fs/promises";
import path from "node:path";
import { readBriefingArchive, briefingIdPattern } from "@/lib/market/briefing-archive";
export const dynamic = "force-dynamic";
export async function GET() {
  const dir = path.join(process.cwd(), "output", "briefing-auto");
  try {
    const archived = await readBriefingArchive(path.join(process.cwd(), "public", "data", "briefing-archive"));
    const names = (await fs.readdir(dir).catch(e => { if (e.code === "ENOENT") return [] as string[]; throw e; })).filter(x => x.endsWith(".json") && briefingIdPattern.test(x.slice(0, -5))).sort().reverse();
    const reports = await Promise.all(names.map(async name => {
      try {
        const id = name.slice(0, -5);
        await fs.access(path.join(dir, `${id}.pdf`));
        return { id, report: JSON.parse(await fs.readFile(path.join(dir, name), "utf8")) };
      } catch { return null; }
    }));
    const merged = new Map(archived.map(entry => [entry.id, entry]));
    for (const entry of reports) if (entry) merged.set(entry.id, entry);
    return Response.json({ reports: [...merged.values()].sort((a, b) => b.id.localeCompare(a.id)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return Response.json({ reports: [] });
    return Response.json({ error: "자동 생성 이력을 읽지 못했습니다." }, { status: 500 });
  }
}
