import { minerviniSession } from "./minervini-session";

export function sectorDateRange(now = new Date()) {
  const latestDate = minerviniSession(now);
  const earliestDate = new Date(Date.parse(`${latestDate}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  return { latestDate, earliestDate };
}
export function resolveSectorDate(date: string, now = new Date()): string {
  const { latestDate, earliestDate } = sectorDateRange(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("올바른 날짜를 선택해 주세요.");
  if (date < earliestDate || date > latestDate) throw new Error(`${earliestDate}부터 ${latestDate}까지 조회할 수 있습니다.`);
  // At 16:00 KST the chosen day's regular close is published; weekends/holidays roll back.
  return minerviniSession(new Date(`${date}T07:00:00Z`));
}
