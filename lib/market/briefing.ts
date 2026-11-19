import { CALENDAR_YEAR, KR_HOLIDAYS, KR_UNCONFIRMED } from "@/config/market-calendar";

export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export function tradingDay(date: string) {
  if (Number(date.slice(0, 4)) !== CALENDAR_YEAR) throw new Error(`${date}: 검증된 한국 거래일 캘린더가 없습니다.`);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6 || KR_HOLIDAYS[date]) return false;
  if (KR_UNCONFIRMED[date] && date !== "2026-11-19") throw new Error(`${date}: ${KR_UNCONFIRMED[date]}`);
  return true;
}
export function resolvePeriod(type: "daily" | "weekly", selected: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selected) || !Number.isFinite(Date.parse(selected)) || new Date(selected).toISOString().slice(0, 10) !== selected) throw new Error("올바른 날짜를 선택해 주세요.");
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  if (selected > today) throw new Error("미래 날짜는 선택할 수 없습니다.");
  const isClosed = (day: string) => now.getTime() >= Date.parse(`${day}T${day === "2026-11-19" ? "16:30" : "15:30"}:00+09:00`);
  let start: string, end: string, days: string[];
  if (type === "daily") {
    end = selected;
    if (!isClosed(end)) end = addDays(end, -1);
    while (!tradingDay(end)) end = addDays(end, -1);
    start = end; days = [end];
  } else {
    const weekday = new Date(`${selected}T00:00:00Z`).getUTCDay();
    start = addDays(selected, -((weekday + 6) % 7));
    const calendarDays = Array.from({ length: 5 }, (_, i) => addDays(start, i));
    days = calendarDays.filter(tradingDay);
    if (!days.length) throw new Error("해당 주에 거래일이 없습니다.");
    end = days[days.length - 1];
    if (!isClosed(end)) throw new Error(`해당 주 마지막 거래일 ${end}의 장 마감 전입니다.`);
  }
  let base = addDays(days[0], -1);
  while (!tradingDay(base)) base = addDays(base, -1);
  return { selected, start, end, base, days, weekEnd: type === "weekly" ? addDays(start, 6) : end };
}
