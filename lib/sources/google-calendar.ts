import { cleanEnv, loadChatbotEnv } from "@/lib/env/chatbot";
import { empty, ok, stale, type SourceResult } from "@/lib/sources/types";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type CalendarEvent = {
  calendarName: string;
  title: string;
  when: string;
};

type GoogleEvent = {
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

function seoulDayBounds(now = new Date()): { timeMin: string; timeMax: string; label: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const date = `${pick("year")}-${pick("month")}-${pick("day")}`;
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(now);
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    label: `${Number(pick("month"))}월 ${Number(pick("day"))}일 ${weekday}`,
  };
}

function formatWhen(event: GoogleEvent): string {
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start) return "종일";
  const clock = (value: string) =>
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  if (!end) return clock(start);
  return `${clock(start)}~${clock(end)}`;
}

export function parseCalendarEvents(calendarName: string, items: unknown): CalendarEvent[] | null {
  if (!Array.isArray(items)) return null;
  const events: CalendarEvent[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const event = raw as GoogleEvent;
    if (event.status === "cancelled") continue;
    if (event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined")) continue;
    const title = String(event.summary ?? "").trim() || "(제목 없음)";
    if (!event.start?.dateTime && !event.start?.date) continue;
    events.push({ calendarName, title, when: formatWhen(event) });
  }
  return events;
}

async function accessToken(): Promise<{ token: string } | { error: string }> {
  loadChatbotEnv();
  const clientId = cleanEnv("GOOGLE_CLIENT_ID");
  const clientSecret = cleanEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = cleanEnv("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return { error: "구글 캘린더 인증 정보가 없습니다." };
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (payload.error === "invalid_grant") {
    return { error: "구글 refresh token이 만료되었거나 철회되었습니다. 챗봇에서 캘린더 로그인을 다시 해야 합니다." };
  }
  if (!response.ok || !payload.access_token) return { error: "구글 로그인 갱신에 실패했습니다." };
  return { token: payload.access_token };
}

export async function fetchTodayEvents(now = new Date()): Promise<SourceResult<{ label: string; events: CalendarEvent[] }>> {
  let token: string;
  try {
    const refreshed = await accessToken();
    if ("error" in refreshed) return stale(refreshed.error);
    token = refreshed.token;
  } catch {
    return stale("구글 로그인 갱신에 실패했습니다.");
  }

  const bounds = seoulDayBounds(now);
  try {
    const listResponse = await fetch(`${CALENDAR_API}/users/me/calendarList?showHidden=true`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!listResponse.ok) return stale("캘린더 목록 조회에 실패했습니다.");
    const list = (await listResponse.json()) as { items?: { id?: string; summary?: string; selected?: boolean; primary?: boolean }[] };
    const calendars = (list.items ?? [])
      .filter((item) => item.selected && item.id)
      .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || (a.summary ?? "").localeCompare(b.summary ?? ""));
    const events: CalendarEvent[] = [];
    let anySuccess = false;
    for (const calendar of calendars) {
      const params = new URLSearchParams({
        timeMin: bounds.timeMin,
        timeMax: bounds.timeMax,
        timeZone: "Asia/Seoul",
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });
      const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendar.id ?? "")}/events?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { items?: unknown };
      const parsed = parseCalendarEvents(calendar.summary?.trim() || "(이름 없음)", payload.items ?? []);
      if (!parsed) continue;
      anySuccess = true;
      events.push(...parsed);
    }
    if (calendars.length && !anySuccess) return stale("일정을 가져오지 못했습니다.");
    if (!events.length) return empty(`${bounds.label} 일정이 없습니다.`);
    return ok({ label: bounds.label, events });
  } catch {
    return stale("일정을 가져오지 못했습니다.");
  }
}
