import { MARKET_LIVE_POLL_MS, type MarketLiveResponse } from "@/lib/market/market-live";
import { marketLiveTradingWindow } from "@/lib/market/market-live-session";
import { loadMarketLiveBoard } from "@/lib/sources/market-live";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function boardCacheHeaders(board: MarketLiveResponse, now: number): HeadersInit {
  if (process.env.VERCEL !== "1" || (board.state !== "open" && board.state !== "auction")) return noStore;
  const window = marketLiveTradingWindow(board.date);
  if (!window) return noStore;
  const [start, end] = board.state === "open" ? [window.openAt, window.auctionAt] : [window.auctionAt, window.closeAt];
  const ttl = Math.floor(Math.min(MARKET_LIVE_POLL_MS, end - now) / 1000);
  if (now < start || ttl < 1) return noStore;
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Vercel-CDN-Cache-Control": `public, s-maxage=${ttl}`,
  };
}

export async function GET(request: Request) {
  if (new URL(request.url).search) {
    return Response.json({ error: "장중 시세는 조회 옵션 없이 요청해 주세요." }, { status: 400, headers: noStore });
  }
  try {
    const board = await loadMarketLiveBoard();
    const { rotationStocks: _stocks, sectorStocks, closingSnapshot: _closing, ...result } = board;
    const response: MarketLiveResponse = { ...result, sectorStocks: sectorStocks ?? [] };
    return Response.json(response, { headers: boardCacheHeaders(response, Date.now()) });
  } catch {
    return Response.json({ error: "장중 시세를 불러오지 못했습니다." }, { status: 503, headers: noStore });
  }
}
