import { readFile } from "node:fs/promises";
import path from "node:path";
import { krxCloseTime } from "@/config/market-calendar";
import { krxClient } from "./krx-client";

export type IndexBar = { date: string; open: number; high: number; low: number; close: number; volume: number };
const markets = { kospi: "1", kosdaq: "2" } as const;
export const indexBarsPath = path.join(process.cwd(), "data", "index-technical", "bars.json");
const priceBasis = "KRX_REGULAR_CLOSE_1530";

export type IndexBarsPublication = {
  version: 1;
  exchange: "KRX";
  priceBasis: typeof priceBasis;
  asOf: string;
  fetchedAt: string;
  markets: Record<keyof typeof markets, IndexBar[]>;
};

const compact = (date: string) => date.replaceAll("-", "");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const numeric = (value: unknown) => typeof value === "string" && /^\d[\d,]*(?:\.\d+)?$/.test(value) ? Number(value.replaceAll(",", "")) : NaN;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (day: number) => new Date(day).toISOString().slice(0, 10);
const dayMs = 86_400_000;

function validBar(bar: IndexBar) {
  return datePattern.test(bar.date) && Number.isFinite(time(bar.date)) && iso(time(bar.date)) === bar.date &&
    [bar.open, bar.high, bar.low, bar.close].every(n => Number.isFinite(n) && n > 0) &&
    bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close) &&
    Number.isSafeInteger(bar.volume) && bar.volume >= 0;
}

export function parseIndexBars(payload: Record<string, unknown>, from: string, through: string): IndexBar[] {
  if (!Array.isArray(payload.output) || !payload.output.length) throw new Error("KRX 일봉 응답 없음");
  const seen = new Set<string>();
  const bars: IndexBar[] = [];
  for (const row of payload.output) {
    const date = String(row?.TRD_DD ?? "").replaceAll("/", "-");
    if (!datePattern.test(date) || !Number.isFinite(time(date)) || iso(time(date)) !== date || date < from || date > through || seen.has(date)) throw new Error("KRX 일봉 거래일 오류");
    seen.add(date);
    if (krxCloseTime(date) !== "15:30") continue;
    const bar = { date, open: numeric(row.OPNPRC_IDX), high: numeric(row.HGPRC_IDX), low: numeric(row.LWPRC_IDX), close: numeric(row.CLSPRC_IDX), volume: numeric(row.ACC_TRDVOL) };
    if (!validBar(bar)) throw new Error(`${date} KRX OHLC·거래량 오류`);
    bars.push(bar);
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export async function collectIndexBars(asOf: string, previous?: IndexBarsPublication | null): Promise<IndexBarsPublication> {
  const cutoff = new Date(time(asOf));
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  const start = cutoff.getTime();
  if (previous && previous.asOf > asOf) throw new Error("KRX 일봉 기준일 역행");
  const extend = previous && Object.values(previous.markets).every(bars => time(bars[0].date) <= start + 7 * dayMs);
  if (extend && previous.asOf === asOf) return previous;
  const result = { kospi: [] as IndexBar[], kosdaq: [] as IndexBar[] };
  for (const market of Object.keys(markets) as (keyof typeof markets)[]) {
    const queryStart = extend ? Math.max(start, time(previous.asOf)) : start;
    if (extend) result[market] = previous.markets[market].filter(bar => bar.date >= iso(start) && bar.date < iso(queryStart));
    for (let cursor = queryStart; cursor <= time(asOf); cursor += 360 * dayMs) {
      const from = iso(cursor);
      const through = iso(Math.min(cursor + 359 * dayMs, time(asOf)));
      const payload = await krxClient.query("MDCSTAT00301", { indIdx: markets[market], indIdx2: "001", strtDd: compact(from), endDd: compact(through) });
      result[market].push(...parseIndexBars(payload, from, through));
    }
    if (result[market].length < 1100 || result[market].at(-1)?.date !== asOf) throw new Error(`${market} KRX 15:30 일봉 이력 부족`);
  }
  if (result.kospi.length !== result.kosdaq.length || result.kospi.some((bar, i) => bar.date !== result.kosdaq[i].date)) throw new Error("코스피·코스닥 일봉 거래일 불일치");
  return { version: 1, exchange: "KRX", priceBasis, asOf, fetchedAt: new Date().toISOString(), markets: result };
}

export async function readIndexBars(): Promise<IndexBarsPublication | null> {
  const raw = await readFile(indexBarsPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return null;
  const data = JSON.parse(raw) as IndexBarsPublication;
  if (data.version !== 1 || data.exchange !== "KRX" || data.priceBasis !== priceBasis || !Number.isFinite(Date.parse(data.fetchedAt)) ||
    Date.parse(data.fetchedAt) < Date.parse(`${data.asOf}T15:30:00+09:00`) || !data.markets ||
    !Object.keys(markets).every(key => {
      const bars = data.markets[key as keyof typeof markets];
      return Array.isArray(bars) && bars.at(-1)?.date === data.asOf && bars.every((bar, i) =>
        validBar(bar) && krxCloseTime(bar.date) === "15:30" && (i === 0 || bars[i - 1].date < bar.date));
    })) return null;
  return data;
}
