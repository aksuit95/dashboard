import { minerviniSession } from "@/lib/market/minervini-session";
import { readStockReturns } from "@/lib/stock-returns/publication";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const market = new URL(request.url).searchParams.get("market");
  if (market !== "kospi" && market !== "kosdaq") return Response.json({ snapshot: null, error: "시장을 선택해 주세요." }, { status: 400 });
  try {
    const p = await readStockReturns();
    if (!p) throw new Error("KRX 종목 등락률 자료가 아직 없습니다.");
    const stale = p.asOf !== minerviniSession();
    return Response.json({ snapshot: { market, asOf: p.asOf, fetchedAt: p.fetchedAt, priceBasis: p.priceBasis, baseDates: p.baseDates, rows: p.markets[market] }, stale }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ snapshot: null, error: "KRX 종목 등락률 자료를 불러오지 못했습니다." }, { status: 503 }); }
}
