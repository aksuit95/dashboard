import { CALENDAR_YEAR, KR_CSAT_2026, KR_UNCONFIRMED, krxCloseTime } from "@/config/market-calendar";
import { calendarNote, localDate, sessionsForDate, shiftDate, zonedTime } from "./market-hours";
import type { MarketLiveBoardData } from "./market-live";

const seoul = "Asia/Seoul";
const exceptionalDay = KR_CSAT_2026;

type MarketLiveWindow = { openAt: number; auctionAt: number; closeAt: number };
type MarketLiveSession = Pick<MarketLiveBoardData, "state" | "note" | "date" | "baselineDate"> & MarketLiveWindow;

function uncertain(date: string) {
  return +date.slice(0, 4) !== CALENDAR_YEAR || (date !== exceptionalDay && Boolean(KR_UNCONFIRMED[date]));
}

export function marketLiveTradingWindow(date: string): MarketLiveWindow | null {
  if (date === exceptionalDay) return {
    openAt: zonedTime(date, 10 * 60, seoul),
    auctionAt: zonedTime(date, 16 * 60 + 20, seoul),
    closeAt: zonedTime(date, 16 * 60 + 30, seoul),
  };
  const sessions = sessionsForDate("krx", date);
  const continuous = sessions.find(session => session.phase === "regular");
  const auction = sessions.find(session => session.phase === "auction" && session.start === continuous?.end);
  return continuous && auction ? { openAt: continuous.start, auctionAt: auction.start, closeAt: auction.end } : null;
}

function previousSession(date: string) {
  for (let i = 1; i <= 14; i++) {
    const day = shiftDate(date, -i);
    if (uncertain(day)) return null;
    if (marketLiveTradingWindow(day)) return day;
  }
  return null;
}

export function hasMarketLiveClosingBasis(date: string, closeAt: number) {
  return closeAt === Date.parse(`${date}T${krxCloseTime(date)}:00+09:00`);
}

export function marketLiveCloseBasis(date: string) {
  return krxCloseTime(date) === "16:30" ? "KRX_REGULAR_CLOSE_1630_KST" : "KRX_REGULAR_CLOSE_1530_KST";
}

function baseline(date: string) {
  const previous = previousSession(date);
  const window = previous && marketLiveTradingWindow(previous);
  return previous && window && hasMarketLiveClosingBasis(previous, window.closeAt) ? previous : null;
}

export function resolveMarketLiveSession(now: number): MarketLiveSession {
  const today = localDate(now);
  const todayWindow = marketLiveTradingWindow(today);
  if (todayWindow && now >= todayWindow.openAt && now < todayWindow.closeAt) return {
    state: now < todayWindow.auctionAt ? "open" : "auction", note: null,
    date: today, baselineDate: baseline(today), ...todayWindow,
  };
  if (!uncertain(today)) {
    const date = todayWindow && now >= todayWindow.closeAt ? today : previousSession(today);
    const window = date && marketLiveTradingWindow(date);
    if (date && window) return {
      state: "closed",
      note: date === today ? "정규장 마감" : todayWindow ? "정규장 개장 전" : calendarNote("krx", today) ?? "정규장 개장 전",
      date, baselineDate: baseline(date), ...window,
    };
  }
  return {
    state: "unconfirmed", note: calendarNote("krx", today) ?? "직전 KRX 거래일 확인 필요",
    date: today, baselineDate: null, openAt: 0, auctionAt: 0, closeAt: 0,
  };
}
