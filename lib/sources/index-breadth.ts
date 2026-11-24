import { readFile } from "node:fs/promises";
import path from "node:path";
import { krxCloseTime } from "@/config/market-calendar";
import { atomicJson } from "@/lib/financials/source";
import { radarPriceBasis, type RadarMarket, type RadarSnapshot } from "@/lib/stock-radar/model";

export type IndexBreadth = { above: number; eligible: number; high: number; low: number; eligible52w: number };
type IndexBreadthPublication = {
  version: 1; exchange: "KRX"; priceBasis: typeof radarPriceBasis; asOf: string; fetchedAt: string;
  source: RadarSnapshot["source"]; markets: Record<RadarMarket, IndexBreadth>;
};
const file = path.join(process.cwd(), "data", "index-technical", "breadth.json");
const markets = ["KOSPI", "KOSDAQ"] as const;

export function publishIndexBreadth(snapshot: RadarSnapshot) {
  if (!snapshot.aboveSma20) return;
  const counts = (market: RadarMarket): IndexBreadth => {
    const metrics = snapshot.rows.flatMap(row => row.market === market && row.metrics["52w"] ? [row.metrics["52w"]] : []);
    return {
      ...snapshot.aboveSma20![market],
      high: metrics.filter(row => row.breakoutPct !== null).length,
      low: metrics.filter(row => row.breakdownPct !== null).length,
      eligible52w: metrics.length,
    };
  };
  const data: IndexBreadthPublication = {
    version: 1, exchange: "KRX", priceBasis: radarPriceBasis, asOf: snapshot.asOf, fetchedAt: snapshot.fetchedAt,
    source: snapshot.source, markets: { KOSPI: counts("KOSPI"), KOSDAQ: counts("KOSDAQ") },
  };
  return atomicJson(file, data);
}

export async function readIndexBreadth(): Promise<IndexBreadthPublication | null> {
  const data = JSON.parse(await readFile(file, "utf8")) as IndexBreadthPublication;
  if (data.version !== 1 || data.exchange !== "KRX" || data.priceBasis !== radarPriceBasis ||
    (data.source !== "KRX_OPEN_API" && data.source !== "NAVER_KRX_CLOSE") || krxCloseTime(data.asOf) !== "15:30" ||
    !Number.isFinite(Date.parse(`${data.asOf}T15:30:00+09:00`)) || !Number.isFinite(Date.parse(data.fetchedAt)) ||
    Date.parse(data.fetchedAt) < Date.parse(`${data.asOf}T15:30:00+09:00`)) return null;
  for (const market of markets) {
    const item = data.markets?.[market];
    if (!item || ![item.above, item.eligible, item.high, item.low, item.eligible52w].every(n => Number.isSafeInteger(n) && n >= 0) ||
      item.above > item.eligible || item.high + item.low > item.eligible52w) return null;
  }
  return data;
}
