import { addDays, seoulDate } from "./calendar";

const WIDGET_SEARCH = "https://widget.myfxbook.com/calendar/search.html";
export const MYFXBOOK_KOREA = "https://www.myfxbook.com/forex-economic-calendar/south-korea";
const indicators = {
  "Interest Rate Decision": "krRate",
  "Inflation Rate YoY": "krCpi",
  "Unemployment Rate": "krJobs",
  "GDP Growth Rate QoQ": "krGdp",
  "Exports YoY": "krExports",
} as const;
type Indicator = (typeof indicators)[keyof typeof indicators];
export type KoreanConsensusQuote = {
  indicator: Indicator;
  date: string;
  time: string;
  period: string;
  value: string;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function referencePeriod(indicator: Indicator, reference: string | undefined, date: string): string | undefined {
  if (indicator === "krRate") return reference ? undefined : date;
  const quarter = reference?.match(/^Q([1-4])$/)?.[1];
  if (indicator === "krGdp" && !quarter) return;
  const month = quarter ? Number(quarter) * 3 : months.indexOf(reference ?? "") + 1;
  if (!month || (quarter && indicator !== "krGdp")) return;
  const [releaseYear, releaseMonth] = date.split("-").map(Number);
  const year = releaseYear - Number(month > releaseMonth);
  return quarter ? `${year}-Q${quarter}` : `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMyfxbookConsensus(html: string): KoreanConsensusQuote[] {
  if (!html.includes('id="calendarMobile"')) throw new Error("Myfxbook 응답 형식 변경");
  return html.split(/<div\s+data-calendar-row="/).slice(1).flatMap(fragment => {
    const row = fragment.split("<div data-event-description", 1)[0];
    if (!/class="calendar-country">\s*KRW\s*<\/div>/.test(row)) return [];
    const title = row.match(/class="calendar-title">\s*([^<]+)/)?.[1].trim();
    const match = title?.match(/^(.+?)(?:\s+\(([A-Za-z0-9]+)\))?$/);
    if (!match || !Object.hasOwn(indicators, match[1])) return [];
    const indicator = indicators[match[1] as keyof typeof indicators];
    const milliseconds = row.match(/data-time-left="(\d{13})"/)?.[1];
    const value = row.match(/\bCons:\s*([+−-]?\d+(?:\.\d+)?\s*%)\s*<\/div>/)?.[1].replace("−", "-").replace(/\s/g, "");
    if (!milliseconds || !value) return [];
    const instant = new Date(Number(milliseconds));
    const date = seoulDate(instant);
    const time = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(instant);
    const period = referencePeriod(indicator, match[2], date);
    return period ? [{ indicator, date, time, period, value }] : [];
  });
}

export async function collectMyfxbookConsensus(today: string): Promise<KoreanConsensusQuote[]> {
  // The provider filters by UTC day. Include the previous UTC day for KST releases before 09:00.
  const response = await fetch(WIDGET_SEARCH, {
    method: "POST",
    headers: {"Content-Type":"application/json", "User-Agent":"research-dashboard/1.0"},
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      startDate: `${addDays(today, -7)}T00:00:00.000Z`,
      endDate: `${addDays(today, 28)}T00:00:00.000Z`,
      language: "en",
      impacts: ["3", "2", "1"],
      currencies: ["KRW"],
    }),
  });
  if (!response.ok) throw new Error(`Myfxbook HTTP ${response.status}`);
  return parseMyfxbookConsensus(await response.text());
}
