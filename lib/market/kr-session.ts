import { usCashSession } from "@/lib/sources/futures-board";

export type SessionKind = "kr" | "after" | "nxt" | "us" | "closed";

export type SessionSpan = {
  kind: Exclude<SessionKind, "closed">;
  start: number;
  end: number;
};

const DAY = 24 * 60;

export function seoulClock(now: Date): { weekday: string; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(read("hour"));
  return {
    weekday: read("weekday"),
    hour: hour === 24 ? 0 : hour,
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

export function seoulMinutes(now: Date): number {
  const clock = seoulClock(now);
  return clock.hour * 60 + clock.minute;
}

/** 미국 정규장 09:30–16:00 을 서울 분으로 옮긴다. 끝은 자정을 넘으면 시작보다 작다. */
export function usCashSpan(now: Date): { start: number; end: number } {
  const shift = zoneOffsetMinutes("Asia/Seoul", now) - zoneOffsetMinutes("America/New_York", now);
  return {
    start: mod(9 * 60 + 30 + shift, DAY),
    end: mod(16 * 60 + shift, DAY),
  };
}

export function sessionSpans(now: Date): SessionSpan[] {
  const us = usCashSpan(now);
  const spans: SessionSpan[] = [
    { kind: "kr", start: 9 * 60, end: 15 * 60 + 30 },
    { kind: "after", start: 16 * 60, end: 20 * 60 },
    { kind: "nxt", start: 8 * 60, end: 9 * 60 },
    { kind: "nxt", start: 15 * 60 + 30, end: 20 * 60 },
  ];
  if (us.end >= us.start) spans.push({ kind: "us", start: us.start, end: us.end });
  else {
    spans.push({ kind: "us", start: us.start, end: DAY });
    spans.push({ kind: "us", start: 0, end: us.end });
  }
  return spans;
}

/** 겹치면 애프터가 NXT보다 앞선다. 미국 정규장은 뉴욕 시각으로 판정한다. */
export function seoulSession(now: Date): { kind: SessionKind; label: string } {
  if (usCashSession(now) === "live") return { kind: "us", label: "US 정규" };
  const clock = seoulClock(now);
  if (clock.weekday === "Sat" || clock.weekday === "Sun") return { kind: "closed", label: "휴장" };
  const minutes = clock.hour * 60 + clock.minute;
  if (minutes >= 9 * 60 && minutes < 15 * 60 + 30) return { kind: "kr", label: "KR 정규" };
  if (minutes >= 16 * 60 && minutes < 20 * 60) return { kind: "after", label: "KR 애프터" };
  if ((minutes >= 8 * 60 && minutes < 9 * 60) || (minutes >= 15 * 60 + 30 && minutes < 20 * 60)) {
    return { kind: "nxt", label: "NXT" };
  }
  return { kind: "closed", label: "휴장" };
}

export function formatClock(now: Date): string {
  const clock = seoulClock(now);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}`;
}

export function formatHm(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function mod(value: number, base: number): number {
  return ((value % base) + base) % base;
}

function zoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = read("hour");
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), hour === 24 ? 0 : hour, read("minute"), read("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}
