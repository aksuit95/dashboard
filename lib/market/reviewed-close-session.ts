import { minerviniSession } from "@/lib/market/minervini-session";

/** The verified 2026 CSAT close is 16:30; do not publish it before closing. */
export function reviewedCloseSession(now = new Date(), publicationDelayMinutes = 30): string {
  const time = now.getTime();
  const specialClose = Date.parse("2026-11-19T16:30:00+09:00");
  const delayMs = publicationDelayMinutes * 60_000;
  if (time >= specialClose && time < Date.parse("2026-11-20T15:30:00+09:00") + delayMs) return "2026-11-19";
  if (time >= Date.parse("2026-11-19T15:30:00+09:00") + delayMs && time < specialClose) return "2026-11-18";
  return minerviniSession(now, 15 * 60 + 30 + publicationDelayMinutes);
}
