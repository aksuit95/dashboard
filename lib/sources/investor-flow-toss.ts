import type { MinerviniUniverse } from "@/config/minervini";
import type { AppDatabase } from "@/lib/db/client";
import type { InvestorBoard } from "./investor-flow";
import { indexParams, krxDate } from "./investor-flow";
import { loadTossInvestorFlows, loadTossMarketFlow, type TossMarketFlow } from "./toss-investor-flow";
import { createInvestorKrxWebQuery } from "./investor-flow-krx-web";

/** Called only by the scheduled daily collector. */
export async function collectInvestorToss(db: AppDatabase, universe: MinerviniUniverse, view: InvestorBoard["view"], board: InvestorBoard) {
  if (view === "index") {
    // Published snapshots are restored on fresh scheduled runners before collection.
    const rows = db.prepare(`SELECT toss FROM investor_flow_daily_snapshots
      WHERE universe = ? AND view = 'index' AND as_of < ? AND toss IS NOT NULL
      ORDER BY as_of DESC`).all(universe, board.asOf) as { toss: string }[];
    let previous: TossMarketFlow | undefined;
    for (const row of rows) {
      try {
        const candidate = JSON.parse(row.toss) as TossMarketFlow;
        if (Array.isArray(candidate.points) && candidate.points.at(-1)?.date === candidate.asOf) { previous = candidate; break; }
      } catch { /* Ignore unusable older snapshots. */ }
    }
    const data = await loadTossMarketFlow(universe, board.asOf, fetch, previous);
    const spec = indexParams[universe], dates = data.points.map(point => point.date.replaceAll("-", ""));
    let prices: { date: string; value: number }[] = [], priceError: string | null = null;
    try {
      const query = createInvestorKrxWebQuery();
      const result = await query("MDCSTAT00301", { indIdx: spec.indIdx, indIdx2: spec.indIdx2, marketIndex: data.market, strtDd: dates[0], endDd: board.asOf.replaceAll("-", ""), sessionDates: JSON.stringify(dates) });
      if (!Array.isArray(result.output)) throw new Error("KRX 지수 이력 없음");
      prices = result.output.map((row: { TRD_DD: string; CLSPRC_IDX: string }) => {
        const value = Number(String(row.CLSPRC_IDX).replaceAll(",", ""));
        if (!Number.isFinite(value) || value <= 0) throw new Error(`${row.TRD_DD} KRX 지수 종가 없음`);
        return { date: krxDate(row.TRD_DD), value };
      }).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
      if (prices.at(-1)?.date !== board.asOf) throw new Error("기준일 KRX 지수 종가 없음");
      const wanted = new Set(data.points.map(point => point.date));
      const found = new Set(prices.map(point => point.date));
      if (prices.length !== found.size || [...wanted].some(day => !found.has(day))) throw new Error("수급 거래일의 KRX 지수 종가 누락");
      prices = prices.filter(point => wanted.has(point.date));
    } catch (error) { prices = []; priceError = error instanceof Error ? error.message : "KRX 지수 이력 조회 실패"; }
    return { ...data, prices, priceError };
  }
  const data = await loadTossInvestorFlows(universe, view, board.asOf, board.equity?.stocks ?? []);
  return data;
}
