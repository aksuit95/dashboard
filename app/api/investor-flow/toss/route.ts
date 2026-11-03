import { isMinerviniUniverse } from "@/config/minervini";
import { getDb } from "@/lib/db/client";
import { loadInvestorBoard } from "@/lib/sources/investor-flow";
import { loadTossInvestorFlows, loadTossMarketFlow } from "@/lib/sources/toss-investor-flow";
import { createOpenApiQuery } from "@/lib/sources/krx-openapi";
import { indexParams } from "@/lib/sources/investor-flow";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, universe = params.get("universe") ?? "", view = params.get("view");
  if (!isMinerviniUniverse(universe) || (view !== "stocks" && view !== "index")) return Response.json({ error: "잘못된 수급 요청" }, { status: 400 });
  try {
    const board = await loadInvestorBoard(getDb(), universe, view);
    if (view === "index") {
      const data = await loadTossMarketFlow(universe, board.asOf);
      const spec = indexParams[universe], dates = data.points.map(point => point.date.replaceAll("-", ""));
      let prices: { date: string; value: number }[] = [], priceError: string | null = null;
      try {
        const query = createOpenApiQuery(getDb(), async () => { throw new Error("지원하지 않는 시세 조회"); });
        const result = await query("MDCSTAT00301", { indIdx: spec.indIdx, indIdx2: spec.indIdx2, marketIndex: data.market, strtDd: dates[0], endDd: board.asOf.replaceAll("-", ""), sessionDates: JSON.stringify(dates) });
        if (!Array.isArray(result.output)) throw new Error("KRX 지수 이력 없음");
        prices = result.output.map((row: { TRD_DD: string; CLSPRC_IDX: string }) => {
          const value = Number(String(row.CLSPRC_IDX).replaceAll(",", ""));
          if (!Number.isFinite(value) || value <= 0) throw new Error(`${row.TRD_DD} KRX 지수 종가 없음`);
          return { date: row.TRD_DD, value };
        }).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
        if (prices.at(-1)?.date !== board.asOf) throw new Error("기준일 KRX 지수 종가 없음");
      } catch (error) { priceError = error instanceof Error ? error.message : "KRX 지수 이력 조회 실패"; }
      return Response.json({ ...data, prices, priceError }, { headers: { "Cache-Control": "no-store" } });
    }
    const data = await loadTossInvestorFlows(universe, view, board.asOf, board.equity?.stocks ?? []);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "토스 수급 수집 실패" }, { status: 503 }); }
}
