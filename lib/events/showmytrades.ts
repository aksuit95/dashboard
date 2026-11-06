import { addDays, seoulDate, type MarketEvent } from "./calendar";

export const SHOWMYTRADES_URL = "https://showmytrades.com/api/public/calendar/v1?currency=USD&impact=high,medium&days=30";
export const SHOWMYTRADES_PAGE = "https://showmytrades.com/tools/economic-calendar";

type Item = { id?: unknown; time?: unknown; currency?: unknown; impact?: unknown; title?: unknown; status?: unknown; confidence?: unknown; period?: unknown; forecast?: unknown; actual?: unknown; previous?: unknown };
const value = (v:unknown) => typeof v === "string" && v.trim() ? v.trim() : undefined;
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
      source:SHOWMYTRADES_PAGE, sourceName:"ShowMyTrades", tentative, forecast:value(raw.forecast), actual:value(raw.actual), previous:value(raw.previous) });
  }
  return { events, generatedAt: data.generated_at };
}

/** Retain recently elapsed events that have left the provider's six-hour window. */
export function mergeRecentEvents(old:MarketEvent[], fresh:MarketEvent[], now:Date):MarketEvent[] {
  const earliest=addDays(seoulDate(now),-7), ids=new Set(fresh.map(e=>e.id));
  const past=old.filter(e=>!ids.has(e.id) && e.date>=earliest && e.time && Date.parse(`${e.date}T${e.time}:00+09:00`)<now.getTime());
  return [...past,...fresh];
}

const korean:Record<string,string> = {
  "Nonfarm Payrolls":"비농업 고용자 수", "Average Hourly Earnings MoM":"평균 시간당 임금 (전월 대비)", "Unemployment Rate":"실업률",
  "Michigan Consumer Sentiment Index":"미시간대 소비자심리지수", "Consumer Price Index YoY":"소비자물가지수 CPI (전년 대비)", "Consumer Price Index MoM":"소비자물가지수 CPI (전월 대비)",
  "Consumer Price Index ex Food & Energy MoM":"근원 소비자물가지수 CPI (전월 대비)", "Consumer Price Index ex Food & Energy YoY":"근원 소비자물가지수 CPI (전년 대비)",
  "Producer Price Index MoM":"생산자물가지수 PPI (전월 대비)", "Producer Price Index ex Food & Energy MoM":"근원 생산자물가지수 PPI (전월 대비)",
  "Retail Sales Control Group":"소매판매 통제그룹", "Retail Sales MoM":"소매판매 (전월 대비)", "FOMC Minutes":"FOMC 의사록",
  "S&P Global Manufacturing PMI":"S&P 글로벌 제조업 PMI", "S&P Global Services PMI":"S&P 글로벌 서비스업 PMI", "Gross Domestic Product Annualized":"국내총생산 GDP (연율)",
  "Durable Goods Orders":"내구재 주문", "Durable Goods Orders ex Transportation":"운송 제외 내구재 주문", "Core Personal Consumption Expenditure - Price Index  YoY":"근원 개인소비지출 PCE 물가지수 (전년 대비)",
  "Core Personal Consumption Expenditure - Price Index  MoM":"근원 개인소비지출 PCE 물가지수 (전월 대비)", "Chicago PMI":"시카고 PMI", "JOLTS Job Openings":"JOLTS 구인건수",
  "ISM Manufacturing Prices Paid":"ISM 제조업 지불가격지수", "ISM Manufacturing Employment Index":"ISM 제조업 고용지수", "ISM Manufacturing PMI":"ISM 제조업 PMI", "ISM Manufacturing New Orders Index":"ISM 제조업 신규주문지수",
  "ADP Employment Change":"ADP 민간 고용 변화", "ISM Services Employment Index":"ISM 서비스업 고용지수", "ISM Services Prices Paid":"ISM 서비스업 지불가격지수", "ISM Services New Orders Index":"ISM 서비스업 신규주문지수", "ISM Services PMI":"ISM 서비스업 PMI",
  "Fed Interest Rate Decision":"연준 기준금리 결정", "Fed Rate Decision":"연준 기준금리 결정", "FOMC Statement":"FOMC 성명서", "FOMC Press Conference":"FOMC 기자회견",
};
export function koreanEventTitle(title:string):string {
  if(korean[title]) return korean[title];
  const speech=title.match(/^Fed['’]s (.+?) speech$/i);
  if(speech) return `연준 ${speech[1]} 연설`;
  return title;
}

/** Only the headline ISM PMI series, preserving provider status and attribution. */
export function headlineIsm(events: MarketEvent[]): MarketEvent[] {
  return events.filter(event => /^ISM\s+(Manufacturing|Services)\s+PMI\b/i.test(event.title));
}
