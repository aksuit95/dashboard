import fs from "node:fs/promises";
import path from "node:path";
import { readBriefingArchive, briefingIdPattern, briefingDirectories, deletedBriefingIds } from "@/lib/market/briefing-archive";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!briefingIdPattern.test(id)) return new Response("잘못된 브리핑", { status: 400 });
  const { local, shared } = briefingDirectories();
  if ((await deletedBriefingIds(local, shared)).has(id)) return new Response("PDF를 찾을 수 없습니다.", { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const bytes = await fs.readFile(path.join(local, `${id}.pdf`));
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${id}.pdf"`, "Cache-Control": "no-store" } });
  } catch {
    const archive = await readBriefingArchive(shared);
    if (archive.some(entry => entry.id === id)) return new Response(null, { status: 307, headers: { Location: `/data/briefing-archive/${id}.pdf`, "Cache-Control": "no-store" } });
    return new Response("PDF를 찾을 수 없습니다.", { status: 404 });
  }
}
