import { addDays, type MarketEvent } from "./calendar";

export type Feed = { updatedAt: string | null; error: string | null; events: MarketEvent[]; generatedAt?: string; capAsOf?: string | null; companies?: import("./dart-earnings").EarningsCompany[] };
export type Snapshot = { feeds: Record<string, Feed> };
export const BLS_URL = "https://www.bls.gov/schedule/2026/home.htm";
export const ISM_URL = "https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/";

function cells(row: string): string[] {
  return [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => m[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
}
function rows(html: string): string[][] { return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => cells(m[1])); }
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function localToSeoul(year: number, month: number, day: number, hour: number, minute: number): {date: string; time: string} {
  // Resolve the New York wall time with the actual DST offset on the given date.
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(new Date(guess));
  const zone = parts.find(p => p.type === "timeZoneName")?.value ?? "";
  const offset = /^GMT([+-]\d{1,2})(?::(\d{2}))?$/.exec(zone);
  if (!offset) throw new Error(`Cannot resolve New York offset: ${zone}`);
  const hours = Number(offset[1]);
  const instant = guess - (hours * 60 + Math.sign(hours) * Number(offset[2] ?? 0)) * 60000;
  const seoul = new Date(instant + 9 * 3600000).toISOString();
  return { date: seoul.slice(0, 10), time: seoul.slice(11, 16) };
}
export function parseBls(html: string, year: number): MarketEvent[] {
  const result: MarketEvent[] = [];
  for (const row of rows(html)) {
    const joined = row.join(" | ");
    const date = joined.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
    const clock = joined.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
    const category = /Consumer Price Index/i.test(joined) ? "미국 소비자물가지수 (CPI)" : /Employment Situation/i.test(joined) ? "미국 고용보고서" : /Producer Price Index/i.test(joined) ? "미국 생산자물가지수 (PPI)" : /Job Openings and Labor Turnover Survey/i.test(joined) ? "미국 JOLTS 구인건수" : null;
    if (!date || !clock || !category || Number(date[3]) !== year) continue;
    const h = Number(clock[1]) % 12 + (clock[3].toUpperCase() === "PM" ? 12 : 0);
    const converted = localToSeoul(year, months.findIndex(m => m.toLowerCase() === date[1].toLowerCase()) + 1, Number(date[2]), h, Number(clock[2]));
    result.push({ id:`bls-${category}-${converted.date}`, ...converted, country:"US", category:"매크로", title:category, detail:"미 노동통계국 발표 일정", source:`https://www.bls.gov/schedule/${year}/home.htm`, sourceName:"미 노동통계국" });
  }
  if (!result.length) throw new Error(`BLS ${year} 일정 구조를 읽지 못했습니다`);
  return result;
}
export function parseIsm(html: string): MarketEvent[] {
  const result: MarketEvent[] = [];
  for (const row of rows(html)) {
    if (row.length < 3) continue;
    const month = row[0].match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})$/i);
    if (!month) continue;
    for (let i=1; i<=2; i++) {
      const day = row[i].match(/^\s*(\d{1,2})\b/);
      if (!day) continue;
      const date = localToSeoul(Number(month[2]), months.findIndex(m => m.toLowerCase() === month[1].toLowerCase()) + 1, Number(day[1]), 10, 0);
      const title = i === 1 ? "미국 ISM 제조업 PMI" : "미국 ISM 서비스업 PMI";
      result.push({id:`ism-${i}-${date.date}`, ...date, country:"US", category:"매크로", title, detail:"ISM 발표 일정", source:ISM_URL, sourceName:"ISM"});
    }
  }
  if (!result.length) throw new Error("ISM 일정 구조를 읽지 못했습니다");
  return result;
}
export async function refreshFeed(old: Feed | undefined, load: () => Promise<MarketEvent[]>, now: string): Promise<Feed> {
  try { return {updatedAt:now, error:null, events:await load()}; }
  catch (error) { return {updatedAt:old?.updatedAt ?? null, error:error instanceof Error ? error.message : String(error), events:old?.events ?? []}; }
}
export function relevantYears(today: string): number[] { return [...new Set([Number(today.slice(0,4)), Number(addDays(today,27).slice(0,4))])]; }


