import { loadMarketBoard, loadMarketLiveGlobalQuotes } from "@/lib/sources/futures-board";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const compact = new URL(request.url).searchParams.get("view") === "market-live";
    const board = compact ? await loadMarketLiveGlobalQuotes() : await loadMarketBoard();
    return Response.json(board, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch {
    return Response.json({ error: "시세를 불러오지 못했습니다." }, { status: 500 });
  }
}
