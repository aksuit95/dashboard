import { loadDailyMinervini } from "@/lib/sources/minervini-cache";
import { isMinerviniUniverse } from "@/config/minervini";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const universe = new URL(request.url).searchParams.get("universe") ?? "kospi200";
  if (!isMinerviniUniverse(universe)) return Response.json({ error: "지원하지 않는 분석 유니버스" }, { status: 400 });
  return Response.json(await loadDailyMinervini(universe), { headers: { "Cache-Control": "no-store" } });
}
