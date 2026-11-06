export type MarketEvent = {
  id: string; date: string; time: string | null; country: "KR" | "US";
  category: "매크로" | "실적"; title: string; detail: string; source: string; sourceName: string; tentative?: boolean;
  forecast?: string; actual?: string; previous?: string;
};

// Manually verified against the linked primary sources. Times and dates are KST.
export const reviewedAt = "2026-11-06";
export const coverageEnd = "2026-12-03";
export const events: MarketEvent[] = [
  { id: "us-jobs-oct", date: "2026-11-06", time: "22:30", country: "US", category: "매크로", title: "미국 고용보고서", detail: "10월 비농업 고용·실업률", source: "https://www.bls.gov/schedule/2026/home.htm", sourceName: "미 노동통계국" },
  { id: "us-cpi-oct", date: "2026-11-10", time: "22:30", country: "US", category: "매크로", title: "미국 소비자물가지수 (CPI)", detail: "10월 소비자물가", source: "https://www.bls.gov/schedule/2026/home.htm", sourceName: "미 노동통계국" },
  { id: "us-ppi-oct", date: "2026-11-13", time: "22:30", country: "US", category: "매크로", title: "미국 생산자물가지수 (PPI)", detail: "10월 생산자물가", source: "https://www.bls.gov/schedule/2026/home.htm", sourceName: "미 노동통계국" },
  { id: "nvda-q3", date: "2026-11-18", time: "06:20", country: "US", category: "실적", title: "엔비디아 실적 발표", detail: "2027 회계연도 3분기 · 약 06:20 발표 예정, 실적 설명회 07:00", source: "https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Sets-Conference-Call-for-Third-Quarter-Financial-Results/default.aspx", sourceName: "NVIDIA IR" },
  { id: "bok-nov", date: "2026-11-26", time: null, country: "KR", category: "매크로", title: "한국은행 금융통화위원회", detail: "통화정책방향 결정 회의 · 발표 시각 미확정", source: "https://www.bok.or.kr/eng/main/contents.do?menuNo=400020", sourceName: "한국은행" },
  { id: "us-ism-manufacturing", date: "2026-12-02", time: "00:00", country: "US", category: "매크로", title: "미국 ISM 제조업 PMI", detail: "11월 제조업 구매관리자지수", source: "https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/", sourceName: "ISM" },
  { id: "us-jolts-oct", date: "2026-12-02", time: "00:00", country: "US", category: "매크로", title: "미국 JOLTS 구인건수", detail: "10월 구인·이직 보고서", source: "https://www.bls.gov/schedule/2026/home.htm", sourceName: "미 노동통계국" },
];

export function seoulDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function upcomingEvents(today: string, all = events): MarketEvent[] {
  const end = addDays(today, 27);
  return all.filter(event => event.date >= today && event.date <= end).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
}

// Only add an undated event when there is evidence of a forthcoming event.
// Do not use this list as a standing company watchlist.
export const undatedEvents: { title: string; detail: string; checkedAt: string; source: string }[] = [];

