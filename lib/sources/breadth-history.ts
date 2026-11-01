import { parseCsv } from "@/lib/imports/csv";
import { ok, stale, type SourceResult } from "@/lib/sources/types";

const DIGEST = "https://aikstockdata.com/data/public/daily/today_";
const CATALOG = "https://aikstockdata.com/data/public/index.json";
const QUOTES = "https://aikstockdata.com/data/public/daily/quotes_";
const HEADERS = { "user-agent": "Mozilla/5.0", accept: "application/json, text/csv" };

/** 코스피·코스닥·코넥스 합산. 시장별 수는 일별 시세 파일에서 따로 센다. */
export type MarketBreadthDay = {
  market: "ALL" | "KOSPI" | "KOSDAQ";
  date: string;
  advancers: number;
  decliners: number;
  unchanged: number;
};

function count(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function sessionDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function parseDigestBreadth(payload: unknown): MarketBreadthDay | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { as_of?: unknown; market_breadth?: unknown };
  const date = sessionDate(body.as_of);
  if (!date || !body.market_breadth || typeof body.market_breadth !== "object") return null;
  const breadth = body.market_breadth as { up?: unknown; down?: unknown; flat?: unknown };
  const advancers = count(breadth.up);
  const decliners = count(breadth.down);
  const unchanged = count(breadth.flat);
  if (advancers == null || decliners == null || unchanged == null) return null;
  if (advancers + decliners + unchanged === 0) return null;
  return { market: "ALL", date, advancers, decliners, unchanged };
}

function calendarDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10).replaceAll("-", ""));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function fetchMarketBreadthHistory(from: string, to: string): Promise<SourceResult<MarketBreadthDay[]>> {
  const byDate = new Map<string, MarketBreadthDay>();
  let sawFile = false;
  for (const stamp of calendarDays(from, to)) {
    let response: Response;
    try {
      response = await fetch(`${DIGEST}${stamp}.json`, { headers: HEADERS });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    sawFile = true;
    const row = parseDigestBreadth(await response.json());
    if (row) byDate.set(row.date, row);
  }
  if (!sawFile) return stale("전 시장 등락 파일을 받지 못했습니다.");
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return stale("전 시장 등락 수가 비어 있습니다.");
  return ok(rows);
}

function change(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

/** 전일대비가 양수면 상승, 음수면 하락, 0이면 보합. 코넥스는 전 시장 합산에만 남긴다. */
export function parseQuoteBreadth(text: string): MarketBreadthDay[] | null {
  const table = parseCsv(text);
  if ("error" in table) return null;
  const dateIndex = table.header.indexOf("basDt");
  const marketIndex = table.header.indexOf("mrktCtg");
  const changeIndex = table.header.indexOf("vs");
  if (dateIndex < 0 || marketIndex < 0 || changeIndex < 0) return null;
  const buckets = new Map<string, MarketBreadthDay>();
  for (const row of table.rows) {
    const market = row[marketIndex];
    if (market !== "KOSPI" && market !== "KOSDAQ") continue;
    const date = sessionDate(row[dateIndex]);
    const delta = change(row[changeIndex] ?? "");
    if (!date || delta == null) continue;
    const key = `${market}:${date}`;
    const current = buckets.get(key) ?? { market, date, advancers: 0, decliners: 0, unchanged: 0 };
    if (delta > 0) current.advancers += 1;
    else if (delta < 0) current.decliners += 1;
    else current.unchanged += 1;
    buckets.set(key, current);
  }
  const rows = [...buckets.values()].filter((row) => row.advancers + row.decliners + row.unchanged > 0);
  return rows.length ? rows.sort((a, b) => a.market.localeCompare(b.market)) : null;
}

async function quoteDates(): Promise<string[] | null> {
  try {
    const response = await fetch(CATALOG, { headers: HEADERS });
    if (!response.ok) return null;
    const body = await response.json() as { daily_archive?: { quotes_available_dates?: unknown } };
    const dates = body.daily_archive?.quotes_available_dates;
    if (!Array.isArray(dates) || dates.some((date) => typeof date !== "string")) return null;
    return dates;
  } catch {
    return null;
  }
}

export async function fetchQuoteBreadth(storedDates: Set<string>): Promise<SourceResult<MarketBreadthDay[]>> {
  const dates = await quoteDates();
  if (!dates?.length) return stale("일별 시세 목록을 받지 못했습니다.");
  const latest = dates.at(-1);
  const needed = dates.filter((date) => date === latest || !storedDates.has(date));
  const rows: MarketBreadthDay[] = [];
  let sawFile = false;
  for (const date of needed) {
    let response: Response;
    try {
      response = await fetch(`${QUOTES}${date}.csv`, { headers: HEADERS });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    sawFile = true;
    const parsed = parseQuoteBreadth(await response.text());
    if (parsed) rows.push(...parsed);
  }
  if (!sawFile) return stale("일별 시세 파일을 받지 못했습니다.");
  if (!rows.length) return stale("KOSPI·KOSDAQ 등락 수가 비어 있습니다.");
  return ok(rows);
}
