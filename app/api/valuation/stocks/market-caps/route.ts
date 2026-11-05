import { readMarketCaps } from "@/lib/valuation/market-caps";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const data = await readMarketCaps();
    if (!data) throw new Error("KRX 시총 저장 자료가 없습니다.");
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "KRX 15:30 종가 기준 시가총액 저장 자료를 불러오지 못했습니다." }, { status: 503 });
  }
}
