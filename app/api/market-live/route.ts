import { MARKET_LIVE_STALE_MS, type MarketLiveBoardData, type MarketLiveRadar, type MarketLiveResponse } from "@/lib/market/market-live";
import { loadMarketLiveBoard } from "@/lib/sources/market-live";
import { readMarketLiveRotationFrame } from "@/lib/sources/market-live-archive";
import { buildMarketLiveRadar, readMarketLivePublication } from "@/lib/sources/market-live-publication";

export const dynamic = "force-dynamic";

function marketLiveRadar(board: MarketLiveBoardData): MarketLiveRadar | null {
  const { state, date, baselineDate, collectedAt, sectors, rotationStocks } = board;
  if (!baselineDate) return null;
  const timestamp = Date.parse(collectedAt);
  const freshStocks = rotationStocks.filter(stock => Date.parse(stock.asOf) >= timestamp - MARKET_LIVE_STALE_MS);
  const live = (state === "open" || state === "auction") && freshStocks.length > 0;
  const current = live
    ? { collectedAt, sectors, stocks: freshStocks }
    : readMarketLiveRotationFrame(date, baselineDate, 0, timestamp);
  if (current) return buildMarketLiveRadar(date, baselineDate, current, live);
  const published = state === "closed" ? readMarketLivePublication(date)?.radar : null;
  return published?.baselineDate === baselineDate ? published : null;
}

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const board = await loadMarketLiveBoard();
    const { rotationStocks: _stocks, ...summary } = board;
    let radar: MarketLiveRadar | null = null;
    try {
      radar = marketLiveRadar(board);
    } catch {
      summary.warnings = [...summary.warnings, "저장된 섹터 시세를 읽지 못했습니다."];
    }
    const result: MarketLiveResponse = { ...summary, radar };
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "장중 시세를 불러오지 못했습니다." }, { status: 503, headers });
  }
}
