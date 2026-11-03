import { loadMarketBoard } from "@/lib/sources/futures-board";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await loadMarketBoard(), { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch {
    return Response.json({ error: "시세를 불러오지 못했습니다." }, { status: 500 });
  }
}
