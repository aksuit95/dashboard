import fs from "node:fs/promises";
import path from "node:path";
import { readBriefingArchive, briefingIdPattern } from "@/lib/market/briefing-archive";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!briefingIdPattern.test(id)) return new Response("잘못된 브리핑", { status: 400 });
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), "output", "briefing-auto", `${id}.pdf`));
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${id}.pdf"`, "Cache-Control": "no-store" } });
  } catch {
    const archive = await readBriefingArchive(path.join(process.cwd(), "public", "data", "briefing-archive"));
    if (archive.some(entry => entry.id === id)) return new Response(null, { status: 307, headers: { Location: `/data/briefing-archive/${id}.pdf`, "Cache-Control": "no-store" } });
    return new Response("PDF를 찾을 수 없습니다.", { status: 404 });
  }
}
