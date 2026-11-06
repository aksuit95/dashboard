import type { MarketEvent } from "./calendar";

export const SHOWMYTRADES_URL = "https://showmytrades.com/api/public/calendar/v1?currency=USD&impact=high,medium&days=30";
export const SHOWMYTRADES_PAGE = "https://showmytrades.com/tools/economic-calendar";

type Item = { id?: unknown; time?: unknown; currency?: unknown; impact?: unknown; title?: unknown; status?: unknown; confidence?: unknown; period?: unknown };
export function parseShowMyTrades(payload: unknown, now: Date): { events: MarketEvent[]; generatedAt: string } {
  if (!payload || typeof payload !== "object") throw new Error("일정 응답이 객체가 아닙니다");
  const data = payload as { events?: unknown; generated_at?: unknown; from?: unknown; to?: unknown; count?: unknown };
  if (!Array.isArray(data.events) || typeof data.generated_at !== "string" || typeof data.from !== "string" || typeof data.to !== "string" || typeof data.count !== "number" || data.count !== data.events.length) throw new Error("일정 응답 형식이 올바르지 않습니다");
  const generated = Date.parse(data.generated_at), from = Date.parse(data.from), to = Date.parse(data.to);
  if (!Number.isFinite(generated) || generated > now.getTime() + 5 * 60000 || now.getTime() - generated > 48 * 3600000 || !Number.isFinite(from) || !Number.isFinite(to) || from > now.getTime() || to < now.getTime() + 27 * 86400000) throw new Error("일정 데이터가 오래되었거나 향후 4주를 포함하지 않습니다");
  const events: MarketEvent[] = [];
  for (const raw of data.events as Item[]) {
    if (typeof raw.id !== "string" || typeof raw.title !== "string" || typeof raw.time !== "string" || typeof raw.currency !== "string" || typeof raw.impact !== "string" || typeof raw.status !== "string") throw new Error("일정 항목 형식이 올바르지 않습니다");
    if (raw.currency !== "USD" || (raw.impact !== "high" && !/\bism\b/i.test(raw.title))) continue;
    if (!["scheduled", "moved", "tentative"].includes(raw.status)) throw new Error("알 수 없는 일정 상태입니다");
    const epoch = Date.parse(raw.time);
    if (!Number.isFinite(epoch) || !/(Z|[+-]\d{2}:\d{2})$/i.test(raw.time)) throw new Error("시간대가 있는 발표 시각이 필요합니다");
    const local = new Date(epoch + 9 * 3600000).toISOString();
    const tentative = raw.status === "tentative" || raw.confidence === "sources_disagree";
    events.push({ id:`smt-${raw.id}`, date:local.slice(0,10), time:local.slice(11,16), country:"US", category:"매크로", title:raw.title,
      detail:[raw.status === "moved" ? "일정 변경됨" : "", typeof raw.period === "string" && raw.period ? `대상 기간 ${raw.period}` : "", tentative ? "제공처 일정 미확정 · 원문 확인 필요" : ""].filter(Boolean).join(" · ") || "시장 영향도 높음",
      source:SHOWMYTRADES_PAGE, sourceName:"ShowMyTrades", tentative });
  }
  return { events, generatedAt: data.generated_at };
}
