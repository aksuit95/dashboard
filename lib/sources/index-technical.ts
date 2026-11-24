import { CALENDAR_YEAR, KR_HOLIDAYS, krxCloseTime } from "@/config/market-calendar";
import { calculateIndexTechnical, indexChange, type IndexSession } from "@/lib/market/index-technical";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { adrRatio } from "@/lib/market/series";
import { readAdr, type AdrDay } from "./adr-naver";
import { readIndexBars, type IndexBar } from "./index-bars";
import { readIndexBreadth, type IndexBreadth } from "./index-breadth";
import kospi from "@/public/data/market-indicators-live/kospi.json";
import kospiMeta from "@/public/data/market-indicators-live/kospi.meta.json";
import kosdaq from "@/public/data/market-indicators-live/kosdaq.json";
import kosdaqMeta from "@/public/data/market-indicators-live/kosdaq.meta.json";

const markets = [
  { id: "kospi", name: "코스피", points: kospi, meta: kospiMeta },
  { id: "kosdaq", name: "코스닥", points: kosdaq, meta: kosdaqMeta },
] as const;

export type IndexTechnicalMarket = {
  id: typeof markets[number]["id"];
  name: string;
  fetchedAt: string | null;
  candlesAt: string | null;
  sessions: IndexSession[];
  daily: { date: string; close: number; change: number | null } | null;
  breadth: { adr: number | null; stocks: IndexBreadth | null };
};

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function readIndexSessions(
  points: { date: string; value: number }[],
  meta: { status: string; source: string; basis: string; asOf: string; fetchedAt: string },
  through: string,
  bars: IndexBar[] = [],
) {
  if (meta.status !== "ok" || meta.source !== "KRX 정보데이터시스템" || !validDate(meta.asOf) ||
    meta.basis !== `KRX 정규장 ${krxCloseTime(meta.asOf)} KST` || !Number.isFinite(Date.parse(meta.fetchedAt)) ||
    !Array.isArray(points) || points.at(-1)?.date !== meta.asOf) return null;

  const timeline = new Map<string, IndexSession>();
  const byDate = new Map(bars.map(bar => [bar.date, bar]));
  let previous = "";
  let asOf = "";
  for (const point of points) {
    if (!validDate(point.date) || point.date <= previous || !Number.isFinite(point.value) || point.value <= 0) return null;
    previous = point.date;
    if (point.date > through) continue;
    const regular1530 = krxCloseTime(point.date) === "15:30";
    const bar = byDate.get(point.date);
    timeline.set(point.date, { date: point.date, regular1530, close: regular1530 ? point.value : null,
      bar: regular1530 && bar?.close === point.value ? bar : undefined });
    if (regular1530) asOf = point.date;
  }
  if (!asOf) return null;

  // A missing regular session must retain its place in return and lookback windows.
  const start = `${CALENDAR_YEAR}-01-01`;
  const first = points[0].date;
  for (const day = new Date(first > start ? first : start); day.toISOString().slice(0, 10) < asOf; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !KR_HOLIDAYS[date] && !timeline.has(date)) {
      timeline.set(date, { date, close: null, regular1530: krxCloseTime(date) === "15:30" });
    }
  }

  return [...timeline.values()].filter(point => point.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
}

export function readIndexTechnicalHistory(...args: Parameters<typeof readIndexSessions>) {
  const sessions = readIndexSessions(...args);
  return sessions ? calculateIndexTechnical(sessions) : null;
}

export function indexAdr(points: { date: string; close: number | null }[], days: AdrDay[]) {
  const byDate = new Map(days.map(day => [day.date, day]));
  const dates = points.slice(1).flatMap((point, i) => {
    const previous = points[i];
    if (krxCloseTime(point.date) !== "15:30" || krxCloseTime(previous.date) !== "15:30") return [];
    return [point.close === null || previous.close === null ? null : point.date];
  }).slice(-20);
  if (dates.length < 20 || dates.at(-1) !== points.at(-1)?.date) return null;
  const window = dates.map(date => date === null ? undefined : byDate.get(date));
  if (!window.every(day => day !== undefined)) return null;
  return window.every(day => day.advancers + day.decliners + day.unchanged > 0) ? adrRatio(window) : null;
}

export async function loadIndexTechnical(now = new Date()) {
  let asOf: string | null;
  try { asOf = reviewedCloseSession(now, 0); }
  catch { asOf = null; }

  const [candles, breadth, adr] = await Promise.all([
    readIndexBars().catch(() => null), readIndexBreadth().catch(() => null), readAdr().catch(() => null),
  ]);
  const indices: IndexTechnicalMarket[] = markets.map(({ id, name, points, meta }) => {
    const sessions = asOf ? readIndexSessions(points, meta, asOf, candles?.markets[id]) ?? [] : [];
    const market = id === "kospi" ? "KOSPI" : "KOSDAQ";
    const latest = sessions.at(-1);
    const day = latest?.date;
    const daily = latest?.close == null ? null : { date: latest.date, close: latest.close, change: indexChange(latest.close, sessions.at(-2)?.close) };
    return {
      id, name, sessions, daily, fetchedAt: daily ? meta.fetchedAt : null,
      candlesAt: latest?.bar ? candles?.fetchedAt ?? null : null,
      breadth: {
        stocks: breadth && breadth.asOf === day ? breadth.markets[market] : null,
        adr: adr && daily && adr.asOf === day ? indexAdr(sessions.slice(-30), adr.markets[market].days) : null,
      },
    };
  });
  return { asOf, indices, specialSession: asOf != null && krxCloseTime(asOf) !== "15:30" };
}
