import type { MinerviniUniverse } from "@/config/minervini";
import type { AppDatabase } from "@/lib/db/client";
import type { InvestorBoard } from "./investor-flow";
import { indexParams } from "./investor-flow";
import { loadTossInvestorFlows, loadTossMarketFlow } from "./toss-investor-flow";
import { createOpenApiQuery } from "./krx-openapi";

/** Called only by the scheduled daily collector. */
export async function collectInvestorToss(db: AppDatabase, universe: MinerviniUniverse, view: InvestorBoard["view"], board: InvestorBoard) {
  if (view === "index") {
    const data = await loadTossMarketFlow(universe, board.asOf);
    const spec = indexParams[universe], dates = data.points.map(point => point.date.replaceAll("-", ""));
    let prices: { date: string; value: number }[] = [], priceError: string | null = null;
    try {
      const query = createOpenApiQuery(db, async () => { throw new Error("지원하지 않는 시세 조회"); });
      const result = await query("MDCSTAT00301", { indIdx: spec.indIdx, indIdx2: spec.indIdx2, marketIndex: data.market, strtDd: dates[0], endDd: board.asOf.replaceAll("-", ""), sessionDates: JSON.stringify(dates) });
      if (!Array.isArray(result.output)) throw new Error("KRX 지수 이력 없음");
      prices = result.output.map((row: { TRD_DD: string; CLSPRC_IDX: string }) => {
        const value = Number(String(row.CLSPRC_IDX).replaceAll(",", ""));
        if (!Number.isFinite(value) || value <= 0) throw new Error(`${row.TRD_DD} KRX 지수 종가 없음`);
        return { date: row.TRD_DD, value };
      }).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
      if (prices.at(-1)?.date !== board.asOf) throw new Error("기준일 KRX 지수 종가 없음");
    } catch (error) { priceError = error instanceof Error ? error.message : "KRX 지수 이력 조회 실패"; }
    return { ...data, prices, priceError };
  }
  const data = await loadTossInvestorFlows(universe, view, board.asOf, board.equity?.stocks ?? []);
  return data;
}
