import { addDays, resolvePeriod, tradingDay } from "./briefing";
export function scheduledBriefings(now = new Date()) {
  const local = new Date(now.getTime() + 9 * 3600000);
  const date = local.toISOString().slice(0, 10);
  if (local.getUTCHours() * 60 + local.getUTCMinutes() < (date === "2026-11-19" ? 16 * 60 + 30 : 16 * 60) || !tradingDay(date)) return [];
  const daily = resolvePeriod("daily", date, now);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const friday = addDays(date, 5 - weekday);
  // Do not guess whether an unconfirmed future session will close the week.
  for (let day = addDays(date, 1); day <= friday; day = addDays(day, 1)) {
    try { if (tradingDay(day)) return [{ type: "daily" as const, period: daily }]; }
    catch { return [{ type: "daily" as const, period: daily }]; }
  }
  return [{ type: "daily" as const, period: daily }, { type: "weekly" as const, period: resolvePeriod("weekly", date, now) }];
}
