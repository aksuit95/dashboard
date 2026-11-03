import { isMinerviniUniverse } from "@/config/minervini";
import { readPublishedInvestorDaily } from "@/lib/sources/investor-flow-publication";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, universe = params.get("universe") ?? "", view = params.get("view");
  if (!isMinerviniUniverse(universe) || (view !== "stocks" && view !== "index")) return Response.json({ error: "잘못된 수급 요청" }, { status: 400 });
  try {
    const saved = await readPublishedInvestorDaily(universe, view, new Date(), params.get("asOf") ?? undefined);
    if (!saved.toss) throw new Error(saved.error ?? "저장된 수급 자료가 없습니다.");
    return Response.json(saved.toss, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "저장 수급 조회 실패" }, { status: 503 }); }
}
