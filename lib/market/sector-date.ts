import { KR_CSAT_2026 } from "@/config/market-calendar";
import { reviewedCloseSession as minerviniSession } from "./reviewed-close-session";

export function sectorPublicationClock(date: string): Date {
  const hour = date === KR_CSAT_2026 ? "07:30" : "07:00";
  return new Date(date + "T" + hour + ":00Z");
}

export function sectorDateRange(now = new Date()) {
  const latestDate = minerviniSession(now);
  const earliestDate = new Date(Date.parse(`${latestDate}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  return { latestDate, earliestDate };
}
export function resolveSectorDate(date: string, now = new Date()): string {
  const { latestDate, earliestDate } = sectorDateRange(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("올바른 날짜를 선택해 주세요.");
  if (date < earliestDate || date > latestDate) throw new Error(`${earliestDate}부터 ${latestDate}까지 조회할 수 있습니다.`);
  return minerviniSession(sectorPublicationClock(date));
}
