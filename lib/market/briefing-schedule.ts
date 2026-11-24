import { krxCloseTime } from "@/config/market-calendar";
import { addDays, resolvePeriod } from "./briefing";

function afterCollectionStarts(date: string, now: Date) {
  const time = krxCloseTime(date) === "16:30" ? "16:30" : "16:00";
  return now.getTime() >= Date.parse(`${date}T${time}:00+09:00`);
}

export function scheduledBriefings(now = new Date()) {
  const date = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7));
  const schedule: { type: "daily" | "weekly"; period: ReturnType<typeof resolvePeriod> }[] = [];
  try {
    const daily = resolvePeriod("daily", date, now);
    if (afterCollectionStarts(daily.end, now)) schedule.push({ type: "daily", period: daily });
    if (daily.end === date) {
      schedule.push({ type: "daily", period: resolvePeriod("daily", daily.base, now) });
    }
  } catch {
    // A session without a verified calendar cannot produce a daily report.
  }
  for (const start of [monday, addDays(monday, -7)]) {
    try {
      const period = resolvePeriod("weekly", start, now);
      if (afterCollectionStarts(period.end, now)) {
        schedule.push({ type: "weekly", period });
        break;
      }
    } catch {
      // This week may still be open or lack a verified trading calendar.
    }
  }
  return schedule;
}
