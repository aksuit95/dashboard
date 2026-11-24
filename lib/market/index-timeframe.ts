import { CALENDAR_YEAR, KR_HOLIDAYS } from "@/config/market-calendar";
import type { IndexBar } from "@/lib/sources/index-bars";

export const indexTimeframes = ["day", "week", "month"] as const;
export type IndexTimeframe = typeof indexTimeframes[number];
export const timeframeLabels: Record<IndexTimeframe, string> = { day: "일봉", week: "주봉", month: "월봉" };

export type IndexSession = {
  date: string;
  close: number | null;
  regular1530: boolean;
  bar?: IndexBar;
  incomplete?: boolean;
};

const dayMs = 86_400_000;
const dayTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

function periodKey(date: string, timeframe: Exclude<IndexTimeframe, "day">) {
  if (timeframe === "month") return date.slice(0, 7);
  const time = dayTime(date);
  const weekday = new Date(time).getUTCDay();
  return iso(time - (weekday + 6) % 7 * dayMs);
}

export function isIndexPeriodIncomplete(date: string, timeframe: Exclude<IndexTimeframe, "day">) {
  const key = periodKey(date, timeframe);
  for (let time = dayTime(date) + dayMs; periodKey(iso(time), timeframe) === key; time += dayMs) {
    const weekday = new Date(time).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const next = iso(time);
    // A weekday beyond the reviewed calendar is conservatively left open.
    if (+next.slice(0, 4) > CALENDAR_YEAR || !KR_HOLIDAYS[next]) return true;
  }
  return false;
}

export function resampleIndexSessions(sessions: readonly IndexSession[], timeframe: IndexTimeframe): readonly IndexSession[] {
  if (timeframe === "day") return sessions;

  const periods = new Map<string, IndexSession[]>();
  for (const session of sessions) {
    if (!session.regular1530) continue;
    const key = periodKey(session.date, timeframe);
    const group = periods.get(key);
    if (group) group.push(session);
    else periods.set(key, [session]);
  }

  const groups = [...periods.values()];
  return groups.map((group, i) => {
    const date = group.at(-1)!.date;
    // A regular session missing OHLC must not turn into a partial OHLC aggregate.
    const bars = group.map(session => session.bar);
    const bar = bars.every(item => item !== undefined) ? {
      date, open: bars[0].open, high: Math.max(...bars.map(item => item.high)), low: Math.min(...bars.map(item => item.low)),
      close: bars.at(-1)!.close, volume: bars.reduce((sum, item) => sum + item.volume, 0),
    } : undefined;
    return { date, close: group.at(-1)!.close, bar, regular1530: true,
      incomplete: i === groups.length - 1 && isIndexPeriodIncomplete(date, timeframe) };
  });
}
