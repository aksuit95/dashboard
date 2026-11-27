import { radarCodePattern, radarPeriod } from "@/lib/stock-radar/krx";
import { getRadarChart, readStockRadar } from "@/lib/stock-radar/publication";
import type { StockChartData } from "@/lib/stock-radar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const search = new URL(request.url).searchParams;
  const period = radarPeriod(search.get("period"));
  const asOf = search.get("asOf");
  const fetchedAt = search.get("fetchedAt");
  const pinned = asOf !== null && fetchedAt !== null;
  if (!radarCodePattern.test(code) || !period || (asOf !== null) !== (fetchedAt !== null)) {
    return Response.json({ error: "종목과 조회 기간을 확인해 주세요." }, { status: 400 });
  }
  try {
    const snapshot = await readStockRadar();
    if (pinned && (!snapshot || snapshot.asOf !== asOf || snapshot.fetchedAt !== fetchedAt)) {
      return Response.json({ error: "분석 자료가 갱신되었습니다. 페이지를 새로고침해 주세요." }, { status: 409 });
    }
    const row = snapshot?.rows.find(entry => entry.code === code);
    const chart = snapshot && row && getRadarChart(snapshot, code, period, !pinned);
    if (!snapshot || !row || !chart) return Response.json({ error: "이 종목에 표시할 KRX 정규장 종가 기록이 부족합니다." }, { status: 404 });
    const data: StockChartData = { ...chart, asOf: snapshot.asOf, market: row.market, priceTime: snapshot.priceTime };
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "KRX 종가 차트를 불러오지 못했습니다." }, { status: 503 });
  }
}
