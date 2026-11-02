import { CALENDAR_YEAR, KR_HOLIDAYS, KR_UNCONFIRMED, US_EARLY_CLOSE, US_HOLIDAYS } from "@/config/market-calendar";

export type MarketId = "krx" | "nxt" | "us";
export type Phase = "overnight" | "pre" | "regular" | "after" | "auction" | "closing";
export type TradingSession = {
  market: MarketId; label: string; phase: Phase; start: number; end: number; lane: number;
};
export const MARKETS = [
  { id: "krx", name: "KRX", subtitle: "한국거래소 · 주식", zone: "Asia/Seoul" },
  { id: "nxt", name: "NXT", subtitle: "넥스트레이드 · 대상 종목", zone: "Asia/Seoul" },
  { id: "us", name: "미국 시장", subtitle: "미국 주식 · Nasdaq / Blue Ocean ATS", zone: "America/New_York" },
] as const;
const DAY = 86_400_000;
const clocks = new Map<string, Intl.DateTimeFormat>();

function partsAt(time: number, zone: string) {
  let formatter = clocks.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    clocks.set(zone, formatter);
  }
  const parts = formatter.formatToParts(time);
  const read = (key: string) => parts.find(p => p.type === key)?.value ?? "00";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, hour: +read("hour"), minute: +read("minute"), second: +read("second") };
}
export function localDate(time: number, zone = "Asia/Seoul") { return partsAt(time, zone).date; }
export function shiftDate(date: string, days: number) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10); }

/** Resolve an exchange-local wall clock through IANA time zones, including DST. */
export function zonedTime(date: string, minutes: number, zone: string): number {
  const target = Date.parse(`${date}T00:00:00Z`) + minutes * 60_000;
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = partsAt(guess, zone);
    const wall = Date.parse(`${p.date}T00:00:00Z`) + (p.hour * 3600 + p.minute * 60 + p.second) * 1000;
    guess += target - wall;
  }
  return guess;
}

export function calendarNote(market: MarketId, date: string): string | null {
  if (+date.slice(0, 4) !== CALENDAR_YEAR) return `${date.slice(0, 4)}년 거래 캘린더 업데이트 필요`;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return "주말 휴장";
  return market === "us" ? US_HOLIDAYS[date] ?? null : KR_HOLIDAYS[date] ?? KR_UNCONFIRMED[date] ?? null;
}

export function sessionsForDate(market: MarketId, date: string): TradingSession[] {
  if (calendarNote(market, date)) return [];
  const zone = market === "us" ? "America/New_York" : "Asia/Seoul";
  const result: TradingSession[] = [];
  const add = (label: string, phase: Phase, start: number, end: number, lane = 0) => {
    result.push({ market, label, phase, start: zonedTime(date, start, zone), end: zonedTime(date, end, zone), lane });
  };
  if (market === "krx") {
    add("장전 시간외종가", "closing", 510, 520);
    add("시가 단일가 접수", "auction", 510, 540, 1);
    add("정규장 · 접속매매", "regular", 540, 920);
    add("종가 동시호가", "auction", 920, 930);
    add("장후 시간외종가", "closing", 940, 960);
    if (date >= "2026-09-14") add("애프터마켓", "after", 960, 1200);
    else add("시간외 단일가", "after", 960, 1080);
  } else if (market === "nxt") {
    add("프리마켓", "pre", 480, 530);
    add("메인마켓", "regular", 540.5, 920);
    add("종가매매", "closing", 930, 960, 1);
    add("애프터마켓", "after", date >= "2026-09-14" ? 960 : 940, 1200);
  } else {
    // Blue Ocean ATS: the session belongs to the following trading date.
    // Sunday 20:00–Monday 04:00 ET is Monday's session, including holiday checks.
    // https://my.blueocean-tech.io/faq/how-does-blue-oceanats-operate
    result.push({ market, label: "주간거래 · 오버나이트", phase: "overnight", lane: 0,
      start: zonedTime(shiftDate(date, -1), 1200, zone), end: zonedTime(date, 240, zone) });
    add("프리마켓", "pre", 240, 570);
    const early = US_EARLY_CLOSE.has(date);
    add(early ? "본장 · 조기폐장" : "본장", "regular", 570, early ? 780 : 960);
    // Early-close extended sessions differ by venue; do not invent an end time.
    if (!early) add("애프터마켓", "after", 960, 1200);
  }
  return result.sort((a, b) => a.start - b.start);
}

export function daySessions(date: string): TradingSession[] {
  // A Seoul calendar day contains portions of two New York trading dates.
  return MARKETS.flatMap(m => [-1, 0].flatMap(offset => sessionsForDate(m.id, shiftDate(date, offset))));
}

export function marketStatus(market: MarketId, now: number) {
  const zone = market === "us" ? "America/New_York" : "Asia/Seoul";
  const date = localDate(now, zone);
  // Include tomorrow's trade date: its overnight session starts tonight in New York.
  const upcoming = Array.from({ length: 11 }, (_, i) => sessionsForDate(market, shiftDate(date, i))).flat().sort((a, b) => a.start - b.start);
  const active = upcoming.filter(s => s.start <= now && now < s.end);
  const note = calendarNote(market, date);
  const uncertain = (market !== "us" && !!KR_UNCONFIRMED[date]) || +date.slice(0, 4) !== CALENDAR_YEAR;
  const earlyAfter = market === "us" && US_EARLY_CLOSE.has(date) && now >= zonedTime(date, 780, zone);
  const next = upcoming.find(s => s.start > now) ?? null;
  return { active, next, note: active.length ? null : earlyAfter ? "조기폐장 · 시간외 운영은 거래소 공지 확인" : note, uncertain: !active.length && (uncertain || earlyAfter), date };
}

export function timeText(time: number, zone = "Asia/Seoul", seconds = false) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hourCycle: "h23" }).format(time);
}

export function remainingText(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h ? `${h}시간 ` : ""}${m}분 ${String(seconds % 60).padStart(2, "0")}초`;
}
