import { CALENDAR_YEAR, KR_HOLIDAYS, KR_UNCONFIRMED } from "@/config/market-calendar";

/** Next confirmed Korean trading day's 16:00 KST boundary, independent of browser timezone. */
export function nextSectorRefreshAt(now = new Date()): Date | null {
  const seoulDate = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const day = Date.parse(`${seoulDate}T00:00:00Z`);
  for (let offset = 0; offset < 15; offset++) {
    const date = new Date(day + offset * 86400000);
    const key = date.toISOString().slice(0, 10);
    if (date.getUTCFullYear() !== CALENDAR_YEAR) return null;
    if ([0, 6].includes(date.getUTCDay()) || KR_HOLIDAYS[key] || KR_UNCONFIRMED[key]) continue;
    const boundary = new Date(`${key}T07:00:00Z`);
    if (boundary.getTime() > now.getTime()) return boundary;
  }
  return null;
}
