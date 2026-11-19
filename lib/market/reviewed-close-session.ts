import { minerviniSession } from "@/lib/market/minervini-session";

/** The verified 2026 CSAT close is 16:30; do not publish it before closing. */
export function reviewedCloseSession(now = new Date()): string {
  const time = now.getTime();
  if (time >= Date.parse("2026-11-19T16:30:00+09:00") && time < Date.parse("2026-11-20T16:00:00+09:00")) return "2026-11-19";
  if (time >= Date.parse("2026-11-19T16:00:00+09:00") && time < Date.parse("2026-11-19T16:30:00+09:00")) return "2026-11-18";
  return minerviniSession(now);
}
