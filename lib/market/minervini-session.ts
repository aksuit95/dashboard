import { CALENDAR_YEAR, KR_HOLIDAYS, KR_UNCONFIRMED } from "@/config/market-calendar";

/** Wait until 16:40 Seoul for daily publication. Exceptional/unreviewed calendars fail closed. */
export function minerviniSession(now = new Date()): string {
  const clock = new Date(now.getTime() + 9 * 3_600_000);
  if (clock.getUTCHours() * 60 + clock.getUTCMinutes() < 1000) clock.setUTCDate(clock.getUTCDate() - 1);
  for (let i = 0; i < 15; i++) {
    const date = clock.toISOString().slice(0, 10);
    if (+date.slice(0, 4) !== CALENDAR_YEAR) throw new Error("한국 거래 캘린더 업데이트 필요");
    if (clock.getUTCDay() !== 0 && clock.getUTCDay() !== 6 && !KR_HOLIDAYS[date]) {
      if (KR_UNCONFIRMED[date]) throw new Error(`${date} 특별 운영시간 확인 필요`);
      return date;
    }
    clock.setUTCDate(clock.getUTCDate() - 1);
  }
  throw new Error("최근 한국 거래일 확인 실패");
}
