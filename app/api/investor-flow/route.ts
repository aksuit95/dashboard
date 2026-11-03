import { isMinerviniUniverse } from "@/config/minervini";
import { getDb } from "@/lib/db/client";
import { loadInvestorBoard } from "@/lib/sources/investor-flow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const universe = params.get("universe") ?? "kospi200", view = params.get("view") ?? "index";
  if (!isMinerviniUniverse(universe) || (view !== "index" && view !== "stocks")) return Response.json({ error: "지원하지 않는 수급 화면입니다." }, { status: 400 });
  try { return Response.json(await loadInvestorBoard(getDb(), universe, view), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "수급 조회 실패" }, { status: 503 }); }
}
