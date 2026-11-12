import fs from "node:fs/promises";
import path from "node:path";
import type { MinerviniUniverse } from "@/config/minervini";
import { krxClient } from "@/lib/sources/krx-client";
import { fetchKrxDailyCloses } from "@/lib/sources/krx-daily-prices";

export type IndexDaily = { close: number; previousDate: string; previousClose: number; change: number };
export type IndexPublication = { version: 1; exchange: "KRX"; priceTime: "15:30 KST"; fetchedAt: string; series: Record<MinerviniUniverse, Record<string, IndexDaily>> };
export const indexPath = path.join(process.cwd(), "data", "sectors", "index-daily.json");
export function parseIndexHistory(payload: unknown, through: string, sessions: string[]): Record<string, IndexDaily> {
  const rows = (payload as { output?: Record<string, unknown>[] })?.output;
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("KRX 지수 이력 부족");
  const parsed = rows.map(row => {
    const date = String(row.TRD_DD ?? "").replaceAll("/", "-");
    const raw = String(row.CLSPRC_IDX ?? "").replaceAll(",", "");
    const close = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || !Number.isFinite(close) || close <= 0 || date > through) throw new Error("KRX 지수 종가 오류");
    return { date, close };
  });
  for (let i = 1; i < parsed.length; i++) if (parsed[i - 1].date <= parsed[i].date) throw new Error("KRX 지수 날짜 순서 오류");
  if (parsed[0].date !== through) throw new Error("KRX 지수 최신 종가 미반영");
  const previous = new Map(sessions.slice(1).map((date, i) => [date, sessions[i]]));
  return Object.fromEntries(parsed.slice(0, -1).filter((row, i) => previous.get(row.date) === parsed[i + 1].date).map((row, i) => {
    const prior = parsed.find(item => item.date === previous.get(row.date))!;
    return [row.date, { close: row.close, previousDate: prior.date, previousClose: prior.close, change: (row.close / prior.close - 1) * 100 }];
  }));
}
export async function collectIndexPublication(through: string): Promise<IndexPublication> {
  const start = new Date(Date.parse(`${through}T00:00:00Z`) - 60 * 86400000).toISOString().slice(0, 10).replaceAll("-", "");
  const end = through.replaceAll("-", "");
  const sessions = (await fetchKrxDailyCloses("005930", through, fetch, 60)).map(row => row.date);
  const series = {} as IndexPublication["series"];
  for (const [universe, indIdx, indIdx2] of [["kospi200", "1", "028"], ["kosdaq150", "2", "203"]] as const) {
    series[universe] = parseIndexHistory(await krxClient.query("MDCSTAT00301", { indIdx, indIdx2, strtDd: start, endDd: end }), through, sessions);
    if (!series[universe][through]) throw new Error(`${universe} 전 거래일 지수 종가 없음`);
  }
  return { version: 1, exchange: "KRX", priceTime: "15:30 KST", fetchedAt: new Date().toISOString(), series };
}
export async function readIndexPublication(): Promise<IndexPublication | null> {
  try {
    const p = JSON.parse(await fs.readFile(indexPath, "utf8")) as IndexPublication;
    if (p.version !== 1 || p.exchange !== "KRX" || p.priceTime !== "15:30 KST" || !p.series?.kospi200 || !p.series?.kosdaq150 || !Number.isFinite(Date.parse(p.fetchedAt))) throw new Error("KRX 지수 파일 오류");
    return p;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
