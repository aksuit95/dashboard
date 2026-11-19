import { loadMarketLiveBoard } from "@/lib/sources/market-live";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const board = await loadMarketLiveBoard();
    const { rotationStocks: _stocks, ...result } = board;
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "장중 시세를 불러오지 못했습니다." }, { status: 503, headers });
  }
}
