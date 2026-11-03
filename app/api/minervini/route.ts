import { readPublishedMinervini } from "@/lib/sources/minervini-publication";
import { isMinerviniUniverse } from "@/config/minervini";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const universe = new URL(request.url).searchParams.get("universe") ?? "kospi200";
  if (!isMinerviniUniverse(universe)) return Response.json({ error: "지원하지 않는 분석 유니버스" }, { status: 400 });
  try { return Response.json(await readPublishedMinervini(universe), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "저장된 미너비니 데이터 확인 실패" }, { status: 503 }); }
}
