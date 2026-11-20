import { loadMarketLiveBoard } from "@/lib/sources/market-live";
import { sectorNames } from "@/config/sectors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const sector = new URL(request.url).searchParams.get("sector");
  if (sector !== null && !sectorNames.some(name => name === sector)) {
    return Response.json({ error: "올바른 섹터를 선택해 주세요." }, { status: 400, headers });
  }
  try {
    const board = await loadMarketLiveBoard();
    const { rotationStocks: _stocks, sectorStocks, ...result } = board;
    const detail = sector ? {
      name: sector,
      stocks: (sectorStocks ?? []).filter(stock => stock.sector === sector),
    } : undefined;
    return Response.json({ ...result, sectorDetail: detail }, { headers });
  } catch {
    return Response.json({ error: "장중 시세를 불러오지 못했습니다." }, { status: 503, headers });
  }
}
