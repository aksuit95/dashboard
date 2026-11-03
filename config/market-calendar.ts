// Reviewed 2026-11-03. Keep annual calendars explicit rather than guessing holidays.
// Constitution Day restoration: https://www.mofa.go.kr/us-newyork-ko/brd/m_4237/view.do?seq=1348072
// https://www.kasi.re.kr/kor/post/newsMaterial/32031
// https://nasdaqtrader.com/Trader.aspx?id=Calendar
// KRX also closes on Labour Day, election day and the final business day of the year.
export const CALENDAR_YEAR = 2026;
export const KR_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "신정",
  "2026-02-16": "설 연휴", "2026-02-17": "설날", "2026-02-18": "설 연휴",
  "2026-03-02": "삼일절 대체공휴일", "2026-05-01": "근로자의 날",
  "2026-05-05": "어린이날", "2026-05-25": "부처님오신날 대체공휴일",
  "2026-06-03": "지방선거", "2026-07-17": "제헌절", "2026-08-17": "광복절 대체공휴일",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석",
  "2026-10-05": "개천절 대체공휴일", "2026-10-09": "한글날",
  "2026-12-25": "성탄절", "2026-12-31": "연말 휴장",
};
export const US_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year’s Day", "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Presidents Day", "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)", "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving", "2026-12-25": "Christmas Day",
};
export const US_EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24"]);
// Do not infer exceptional opening hours before an exchange notice is verified.
export const KR_UNCONFIRMED: Record<string, string> = {
  "2026-01-02": "연초 개장 시간 확인 필요",
  "2026-11-19": "수능일 특별 운영시간 확인 필요",
};
