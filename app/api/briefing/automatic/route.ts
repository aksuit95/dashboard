import fs from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
export async function GET() {
  const dir = path.join(process.cwd(), "output", "briefing-auto");
  try {
    const names = (await fs.readdir(dir)).filter(x => /^(daily|weekly)-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().reverse();
    const reports = await Promise.all(names.map(async name => {
      try {
        const id = name.slice(0, -5);
        await fs.access(path.join(dir, `${id}.pdf`));
        return { id, report: JSON.parse(await fs.readFile(path.join(dir, name), "utf8")) };
      } catch { return null; }
    }));
    return Response.json({ reports: reports.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return Response.json({ reports: [] });
    return Response.json({ error: "자동 생성 이력을 읽지 못했습니다." }, { status: 500 });
  }
}
