import { radarCodePattern, radarPeriod } from "@/lib/stock-radar/krx";
import { getRadarChart, readStockRadar } from "@/lib/stock-radar/publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const search = new URL(request.url).searchParams;
  const period = radarPeriod(search.get("period"));
  if (!radarCodePattern.test(code) || !period) return Response.json({ error: "종목과 조회 기간을 확인해 주세요." }, { status: 400 });
  try {
    const snapshot = await readStockRadar();
    if (!snapshot || snapshot.asOf !== search.get("asOf") || snapshot.fetchedAt !== search.get("fetchedAt")) return Response.json({ error: "분석 자료가 갱신되었습니다. 페이지를 새로고침해 주세요." }, { status: 409 });
    const chart = getRadarChart(snapshot, code, period);
    if (!chart) return Response.json({ error: "조회 기간의 차트에 필요한 KRX 종가가 부족합니다." }, { status: 404 });
    return Response.json(chart, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "KRX 종가 차트를 불러오지 못했습니다." }, { status: 503 });
  }
}
