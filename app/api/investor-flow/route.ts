import { isMinerviniUniverse } from "@/config/minervini";
import { readPublishedInvestorDaily } from "@/lib/sources/investor-flow-publication";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const universe = params.get("universe") ?? "kospi200", view = params.get("view") ?? "index";
  if (!isMinerviniUniverse(universe) || (view !== "index" && view !== "stocks")) return Response.json({ error: "지원하지 않는 수급 화면입니다." }, { status: 400 });
  try {
    const saved = await readPublishedInvestorDaily(universe, view);
    return Response.json({ ...saved.board, collectionError: saved.error, stale: saved.board.asOf !== saved.expected }, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "수급 조회 실패" }, { status: 503 }); }
}
