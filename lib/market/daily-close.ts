import { US_EARLY_CLOSE, US_HOLIDAYS } from "@/config/market-calendar";
import { localDate, shiftDate, zonedTime } from "@/lib/market/market-hours";

/** 마지막으로 지난 서울 16:00 갱신 시점. 장중·주말에는 직전 평일 종가까지만 허용한다. */
export function closeDate(now = new Date()): string {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (seoul.getUTCHours() * 60 + seoul.getUTCMinutes() < 16 * 60) seoul.setUTCDate(seoul.getUTCDate() - 1);
  while (seoul.getUTCDay() === 0 || seoul.getUTCDay() === 6) seoul.setUTCDate(seoul.getUTCDate() - 1);
  return seoul.toISOString().slice(0, 10);
}

export function nextCloseDelay(now = new Date()): number {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const next = new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), 7, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}
/** Latest completed US cash session, in New York trading dates. */
export function usCloseDate(now = new Date()): string {
  let date = localDate(now.getTime(), "America/New_York");
  for (;;) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const close = zonedTime(date, US_EARLY_CLOSE.has(date) ? 780 : 960, "America/New_York");
    if (weekday !== 0 && weekday !== 6 && !US_HOLIDAYS[date] && close <= now.getTime()) return date;
    date = shiftDate(date, -1);
  }
}

/** Publish completed US closes with the daily 09:00 Seoul US indicators refresh. */
export function usRefreshDate(now = new Date()): string {
  const seoulDate = localDate(now.getTime());
  let refresh = zonedTime(seoulDate, 540, "Asia/Seoul");
  if (refresh > now.getTime()) refresh = zonedTime(shiftDate(seoulDate, -1), 540, "Asia/Seoul");
  return usCloseDate(new Date(refresh));
}

export function nextUsRefreshDelay(now = new Date()): number {
  const date = localDate(now.getTime());
  let next = zonedTime(date, 540, "Asia/Seoul");
  if (next <= now.getTime()) next = zonedTime(shiftDate(date, 1), 540, "Asia/Seoul");
  return next - now.getTime();
}
