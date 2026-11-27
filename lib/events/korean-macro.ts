import { addDays, seoulDate, type MarketEvent } from "./calendar";
import { refreshFeed, type Feed } from "./refresh";

const BOK = "https://www.bok.or.kr";
const KOSTAT = "https://www.kostat.go.kr";
const CUSTOMS = "https://www.customs.go.kr";
const CUSTOMS_LIST = `${CUSTOMS}/kcs/na/ntt/selectNttList.do?bbsId=1362&mi=2891&searchType=sj&searchValue=${encodeURIComponent("수출입 현황")}`;
const CUSTOMS_SCHEDULE = `${CUSTOMS}/kcs/na/ntt/selectNttInfo.do?bbsId=2280&mi=10600&nttSn=10141577`;
export const KOREAN_MACRO_FEEDS = {
  krRate: "한국은행 기준금리", krCpi: "소비자물가", krJobs: "고용동향",
  krIndustry: "산업활동", krGdp: "국내총생산", krExports: "월간 수출",
} as const;
type FeedKey = keyof typeof KOREAN_MACRO_FEEDS;
type StatsKey = "krCpi" | "krJobs" | "krIndustry";
type Read = (url: string) => Promise<string>;
type Release = { date: string; time: string | null; period: string; source: string; stage?: "속보" | "잠정" | "확정"; tentative?: boolean };
type Publication = Pick<Release, "period" | "source" | "stage"> & { date?: string };
type Outlook = { value: string; source: string; label: string };

const stats = {
  krCpi: { board: "mid=a10301040100&bid=213", label: "소비자물가동향", basis: "전년 동월 대비" },
  krJobs: { board: "mid=a10301030300&bid=210", label: "고용동향", basis: "계절조정 실업률" },
  krIndustry: { board: "mid=a10301010000&bid=216", label: "산업활동동향", basis: "전산업생산 전월 대비" },
} satisfies Record<StatsKey, { board: string; label: string; basis: string }>;

const pad = (n: string | number) => String(n).padStart(2, "0");
const compact = (s: string) => s.replace(/\s/g, "");
function plain(html: string): string {
  return html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#37;/g, "%").replace(/\s+/g, " ").trim();
}
function attribute(html: string, name: string): string | undefined {
  return html.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`))?.slice(1).find(value => value !== undefined)?.replace(/&amp;/g, "&");
}
const rows = (html: string) => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => row[1]);
const cells = (row: string) => [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => plain(cell[1]));
function shiftMonth(period: string, by: number): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + by, 1)).toISOString().slice(0, 7);
}
function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = shiftMonth(month, 1)) result.push(month);
  return result;
}
function monthlyPeriod(title: string): string | undefined {
  const match = title.match(/(20\d{2})\s*년\s*(1[0-2]|[1-9])\s*월/);
  if (match) return `${match[1]}-${pad(match[2])}`;
}
function time(value: string): string | null {
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match ? `${pad(match[1])}:${match[2]}` : null;
}
function statsPeriod(key: StatsKey, title: string): string | undefined {
  const label = title.match(/^20\d{2}\s*년\s*\d{1,2}\s*월\s*(?:및\s*연간\s*)?(.+)$/)?.[1];
  if (label && compact(label) === stats[key].label) return monthlyPeriod(title);
}
export function parseStatsSchedule(html: string, month: string, key: StatsKey, source: string): Release[] {
  if (!/name="oa_mm"/.test(html)) throw new Error("국가데이터처 보도계획 형식 변경");
  return rows(html).flatMap(row => {
    const [day, clock, title] = cells(row);
    const period = title && statsPeriod(key, title);
    const date = day?.match(/^(\d{2})\.(\d{2})\./);
    if (!period || !date || date[1] !== month.slice(5) || period < shiftMonth(month, -2) || period > month) return [];
    return [{ date: `${month}-${date[2]}`, time: time(clock), period, source }];
  });
}
function statsPublications(html: string, key: StatsKey): Publication[] {
  if (!html.includes('class="board_link"')) throw new Error("국가데이터처 보도자료 목록 형식 변경");
  const links = [...html.matchAll(/<a\b([^>]*class="board_link"[^>]*)>([\s\S]*?)<\/a>/gi)];
  return links.flatMap(([, tag, body], index) => {
    const period = statsPeriod(key, plain(body));
    const item = tag.match(/\blist_no=(\d+)/)?.[1];
    const date = html.slice(links[index].index, links[index + 1]?.index)
      .match(/<strong>게시일<\/strong>\s*<span>(20\d{2}-\d{2}-\d{2})<\/span>/)?.[1];
    return period && item && date ? [{ period, date, source: `${KOSTAT}/board.es?${stats[key].board}&act=view&list_no=${item}` }] : [];
  });
}
function gdpPeriod(title: string): Pick<Release, "period" | "stage"> | undefined {
  const match = title.match(/^(20\d{2})\s*년\s*([1-4])\s*\/\s*4분기\s*(?:및 연간\s*)?(실질\s*국내총생산|국민소득)\s*\((속보|잠정)\)$/);
  if (match) return { period: `${match[1]}-Q${match[2]}`, stage: match[4] === "속보" ? "속보" : "잠정" };
}
function parseGdpSchedule(html: string, source: string): Release[] {
  if (!html.includes("월간통계공표일정 목록")) throw new Error("한국은행 통계 공표일정 형식 변경");
  return rows(html).flatMap(row => {
    const [date, clock, title] = cells(row);
    const series = title && gdpPeriod(title);
    return series && /^20\d{2}-\d{2}-\d{2}$/.test(date) ? [{ ...series, date, time: time(clock), source }] : [];
  });
}
function parseRateSchedule(html: string, year: string, source: string): Release[] {
  if (!html.includes('id="pYear"')) throw new Error("한국은행 금통위 회의 일정 형식 변경");
  return rows(html).flatMap(row => {
    const match = cells(row)[0]?.match(/^(\d{1,2})월\s*(\d{1,2})일\s*\(/);
    if (!match) return [];
    const date = `${year}-${pad(match[1])}-${pad(match[2])}`;
    return [{ date, time: null, period: date, source }];
  });
}
function bokPublications(html: string, key: "krGdp" | "krRate"): Publication[] {
  if (!/@@@\d+@@@/.test(html)) throw new Error("한국은행 보도자료 목록 형식 변경");
  return [...html.matchAll(/<span class="date">\s*<span[^>]*>등록일<\/span>\s*(20\d{2}\.\d{2}\.\d{2})\s*<\/span>[\s\S]*?<a href="(\/portal\/bbs\/[A-Z0-9]+\/view\.do\?[^"]+)" class="title">([\s\S]*?)<\/a>/g)]
    .flatMap(([, rawDate, path, body]) => {
      const title = plain(body), date = rawDate.replaceAll(".", "-");
      const series = key === "krGdp" ? gdpPeriod(title) : /^통화정책방향\s*\(20\d{2}\.\d{2}\.\d{2}\)$/.test(title) ? { period: date } : undefined;
      const url = new URL(path, BOK);
      const id = url.searchParams.get("nttId");
      if (!series || !id || !/^\d+$/.test(id)) return [];
      const menu = url.searchParams.get("menuNo") === "200690" ? "200690" : "201264";
      return [{ ...series, date, source: `${BOK}${url.pathname}?menuNo=${menu}&nttId=${id}` }];
    });
}
function exportPublications(html: string): Publication[] {
  if (!html.includes("nttInfoBtn")) throw new Error("관세청 보도자료 목록 형식 변경");
  return rows(html).flatMap(row => {
    const link = row.match(/<a\b([^>]*class="nttInfoBtn"[^>]*)>/)?.[1];
    if (!link) return [];
    const title = attribute(link, "title") ?? "";
    const match = title.match(/^20\d{2}년\s*\d{1,2}월\s+(월간\s+)?수출입\s*현황\s*\[(잠정|확정)치\]$/);
    const date = cells(row).find(cell => /^20\d{2}\.\d{2}\.\d{2}$/.test(cell))?.replaceAll(".", "-");
    const period = monthlyPeriod(title);
    const item = attribute(link, "data-id"), token = attribute(link, "data-url");
    if (!match || !period || !date || !item || !/^\d+$/.test(item) || !token || !/^[a-f0-9]+$/i.test(token)) return [];
    return [{ date, period, stage: match[2] === "잠정" ? "잠정" : "확정", source: `${CUSTOMS}/kcs/na/ntt/selectNttInfo.do?bbsId=1362&mi=2891&nttSn=${item}&nttSnUrl=${token}` }];
  });
}

const number = "([+−-]?\\d+(?:\\.\\d+)?)";
function signed(value: string, direction?: string): string {
  const normalized = value.replace("−", "-");
  return `${/^(감소|하락|위축)/.test(direction ?? "") && !normalized.startsWith("-") ? "-" + normalized.replace(/^\+/, "") : normalized}%`;
}
export function parseOfficialResult(key: FeedKey, html: string): { actual: string; previous?: string; note?: string } | undefined {
  const body = key in stats ? html.match(/<div class="board_content"[^>]*>([\s\S]*?)<\/div>/)?.[1] : html;
  if (!body) return;
  const text = compact(plain(body));
  if (key === "krRate") {
    const match = text.match(new RegExp(`기준금리를(?:현재의)?${number}%(?:수준)?에서${number}%(?:로|수준으로)`));
    if (match) return { actual: signed(match[2]), previous: signed(match[1]) };
    const hold = text.match(new RegExp(`기준금리를(?:현재의)?${number}%(?:수준)?에서유지`))
      ?? text.match(new RegExp(`기준금리를현수준\\(${number}%\\)에서유지`));
    if (hold) return { actual: signed(hold[1]), previous: signed(hold[1]) };
    return;
  }
  if (key === "krExports") {
    const match = text.match(new RegExp(`수출[\\d,.]+억달러,?수입[\\d,.]+억달러(?:로)?전년동기대비(?:수출)?${number}%(?:\\([^)]*\\))?(증가|감소)`))
      ?? text.match(new RegExp(`전년동월대비수출은${number}%(증가|감소)`));
    const chips = text.match(/반도체\(\s*([\d,.]+억달러)\s*\)/);
    if (match) return { actual: signed(match[1], match[2]), ...(chips ? { note: `반도체 수출 ${chips[1].replace("억달러", "억 달러")}` } : {}) };
    return;
  }
  const patterns: Record<Exclude<FeedKey, "krRate" | "krExports">, string> = {
    krCpi: `소비자물가지수는[^□▣]{0,80}?전년동월대비${number}%(?:로|각각)?(상승|하락|증가|감소)`,
    krJobs: `계절조정실업률은${number}%`,
    krIndustry: `전산업생산(?:은|이)[^□▣]{0,140}?전월대비${number}%(증가|감소|상승|하락)`,
    krGdp: `실질국내총생산(?:\\(GDP\\))?(?:은|는|이)전기대비${number}%(성장|증가|감소|상승|하락|위축)`,
  };
  const match = text.match(new RegExp(patterns[key]));
  if (match) return { actual: signed(match[1], match[2]) };
  const flat = key === "krCpi" ? /소비자물가지수는[^□▣]{0,80}?전년동월대비(?:변동없음|보합)/ :
    key === "krIndustry" ? /전산업생산(?:은|이)[^□▣]{0,140}?전월대비(?:변동없음|보합)/ : null;
  if (flat?.test(text)) return { actual: "0.0%" };
}

function previousPeriod(key: FeedKey, period: string): string {
  if (key !== "krGdp") return shiftMonth(period, -1);
  const [year, quarter] = period.split("-Q").map(Number);
  return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
}
function id(key: FeedKey, release: Release): string {
  return `${key}-${release.period}${release.stage ? `-${release.stage}` : ""}`;
}
function asEvent(key: FeedKey, release: Release): MarketEvent {
  const sourceName = key === "krRate" || key === "krGdp" ? "한국은행" : key === "krExports" ? "관세청" : "국가데이터처";
  const basis = key === "krRate" ? "통화정책방향 결정회의" : key === "krGdp" ? "실질 GDP 전분기 대비" :
    key === "krExports" ? "총수출 전년 동월 대비" : stats[key].basis;
  return { id: id(key, release), date: release.date, time: release.time, country: "KR", category: "매크로",
    title: KOREAN_MACRO_FEEDS[key], source: release.source, sourceName, tentative: release.tentative,
    detail: [key === "krRate" ? "" : `대상 기간 ${release.period}`, basis, release.stage ? `${release.stage}치` : "",
      release.tentative ? "매월 1일 정례 공표 예정" : ""].filter(Boolean).join(" · ") };
}

// Independently published survey consensus, linked to this exact meeting.
const verifiedConsensus: Record<string, Outlook> = {
  "krRate-2026-11-26": { value: "3.25%", label: "AJP 설문", source: "https://www.ajupress.com/view/20261123163804930" },
};
export type CalendarQuote = { Country?: string; Event?: string; Date?: string; ReferenceDate?: string; Forecast?: string };
export function matchConsensus(key: FeedKey, release: Release, quotes: CalendarQuote[]): Outlook | undefined {
  const names = {
    krRate: /^interest rate decision$/i, krCpi: /^inflation rate yoy$/i, krJobs: /^unemployment rate$/i,
    krIndustry: null, krGdp: /^gdp growth rate qoq (?:prel|prelim(?:inary)?)$/i, krExports: /^exports? yoy$/i,
  }[key];
  if (!names || release.stage === "확정" || (key === "krGdp" && release.stage !== "속보")) return;
  const match = quotes.filter(row => {
    if (typeof row?.Country !== "string" || row.Country.toLowerCase() !== "south korea" ||
      typeof row.Event !== "string" || !names.test(row.Event) || typeof row.Date !== "string" ||
      typeof row.Forecast !== "string" || !/^[-+]?\d+(?:\.\d+)?%$/.test(row.Forecast.trim())) return false;
    const instant = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(row.Date) ? row.Date : `${row.Date}Z`);
    if (!Number.isFinite(instant.getTime()) || seoulDate(instant) !== release.date) return false;
    if (key === "krRate") return true;
    const reference = typeof row.ReferenceDate === "string" && row.ReferenceDate.match(/^(20\d{2})-(0[1-9]|1[0-2])-\d{2}/);
    if (!reference) return false;
    const period = key === "krGdp" ? `${reference[1]}-Q${Math.ceil(Number(reference[2]) / 3)}` : `${reference[1]}-${reference[2]}`;
    return period === release.period;
  });
  if (match.length === 1) return { value: match[0].Forecast!.trim(), label: "Trading Economics 설문", source: "https://tradingeconomics.com/south-korea/calendar" };
}

async function publicationResult(key: FeedKey, publication: Publication, read: Read) {
  const result = parseOfficialResult(key, await read(publication.source));
  if (!result) throw new Error(`${publication.period} 공식 발표값을 읽지 못했습니다`);
  return result;
}
function bokSearch(term: string): string {
  const params = new URLSearchParams({ menuNo: "201264", targetDepth: "4", pageIndex: "1", syncMenuChekKey: "1",
    searchCnd: "2", searchKwd: term, sort: "1", pageUnit: "10" });
  return `${BOK}/portal/singl/newsData/listCont.do?${params}`;
}

export async function refreshKoreanMacroFeeds(old: Record<string, Feed>, now: Date, download: Read, quotes: CalendarQuote[] = []) {
  const today = seoulDate(now), from = addDays(today, -6), to = addDays(today, 27);
  const months = monthsBetween(from, to);
  const cache = new Map<string, Promise<string>>();
  const read: Read = url => {
    if (!cache.has(url)) cache.set(url, download(url));
    return cache.get(url)!;
  };
  const keys = Object.keys(KOREAN_MACRO_FEEDS) as FeedKey[];
  const entries = await Promise.all(keys.map(async key => {
    const resultErrors = new Set<string>();
    const feed = await refreshFeed(old[key], async () => {
      let schedule: Release[], publications: Publication[];
      if (key === "krRate") {
        const urls = [...new Set(months.map(month => month.slice(0, 4)))].map(year =>
          [year, `${BOK}/portal/singl/crncyPolicyDrcMtg/listYear.do?menuNo=200755&mtgSe=A&pYear=${year}`] as const);
        schedule = (await Promise.all(urls.map(async ([year, source]) => parseRateSchedule(await read(source), year, source)))).flat();
        publications = bokPublications(await read(bokSearch("통화정책방향")), key);
      } else if (key === "krGdp") {
        const urls = months.map(month => `${BOK}/portal/stats/statsPublictSchdul/listCldr.do?date=${month}&menuNo=200775`);
        schedule = (await Promise.all(urls.map(async source => parseGdpSchedule(await read(source), source)))).flat();
        publications = (await Promise.all(["국내총생산", "국민소득"].map(async term => bokPublications(await read(bokSearch(term)), key)))).flat();
      } else if (key === "krExports") {
        publications = exportPublications(await read(CUSTOMS_LIST));
        schedule = months.map(month => ({ date: `${month}-01`, time: null, period: shiftMonth(month, -1),
          source: CUSTOMS_SCHEDULE, stage: "잠정", tentative: true }));
        schedule.push(...publications.flatMap(item => item.date ? [{ ...item, date: item.date, time: null }] : []));
        const posted = new Set(publications.filter(item => item.date && item.date <= today).map(item => `${item.period}-${item.stage}`));
        schedule = schedule.filter(item => !item.tentative || !posted.has(`${item.period}-${item.stage}`));
      } else {
        schedule = (await Promise.all(months.map(async month => {
          const source = `${KOSTAT}/newsPln.es?mid=a10305000000&oa_yr=${month.slice(0, 4)}&oa_mm=${month.slice(5)}`;
          return parseStatsSchedule(await read(source), month, key, source);
        }))).flat();
        publications = statsPublications(await read(`${KOSTAT}/board.es?${stats[key].board}`), key);
      }
      // A posted release takes precedence when the agency moved the planned date.
      const plans = new Map(schedule.map(item => [id(key, item), item]));
      for (const post of publications) {
        if (!post.date || post.date < from || post.date > today) continue;
        const plan = plans.get(id(key, { ...post, date: post.date, time: null }));
        plans.set(id(key, { ...post, date: post.date, time: null }), {
          ...post, date: post.date, time: plan?.date === post.date ? plan.time : null,
        });
      }
      const events = await Promise.all([...plans.values()].filter(item => item.date >= from && item.date <= to).map(async item => {
        const event = asEvent(key, item);
        const publication = publications.find(post => post.period === item.period && post.stage === item.stage && post.date === item.date);
        const oldEvent = old[key]?.events.find(previous => previous.id === event.id && previous.date === event.date);
        const consensus = matchConsensus(key, item, quotes) ?? verifiedConsensus[event.id];
        if (consensus) {
          event.forecast = consensus.value;
          event.forecastSource = consensus.source;
          event.forecastLabel = consensus.label;
        } else if (oldEvent?.forecast && oldEvent.forecastSource) {
          event.forecast = oldEvent.forecast;
          event.forecastSource = oldEvent.forecastSource;
          event.forecastLabel = oldEvent.forecastLabel;
        }
        if (!item.tentative && publication && item.date <= today &&
          (!item.time || Date.parse(`${item.date}T${item.time}:00+09:00`) <= now.getTime())) {
          try {
            const result = await publicationResult(key, publication, read);
            event.actual = result.actual;
            event.previous = result.previous;
            event.source = publication.source;
            if (result.note) event.detail += ` · ${result.note}`;
          } catch {
            resultErrors.add(`${publication.period} 발표값 조회 실패`);
          }
        }
        if (key !== "krRate" && !event.previous) {
          const previous = publications.find(post => post.period === previousPeriod(key, item.period) &&
            post.stage === item.stage && (!post.date || post.date < item.date));
          if (previous) {
            try { event.previous = (await publicationResult(key, previous, read)).actual; }
            catch { resultErrors.add(`${previous.period} 이전값 조회 실패`); }
          }
        }
        if (oldEvent?.actual && !event.actual && item.date <= today) {
          event.actual = oldEvent.actual;
          event.previous ??= oldEvent.previous;
          event.detail = oldEvent.detail;
          event.source = oldEvent.source;
          event.tentative = false;
        }
        return event;
      }));
      return events;
    }, now.toISOString());
    if (resultErrors.size && !feed.error) feed.error = [...resultErrors].sort().join(" · ");
    return [key, feed] as const;
  }));
  return Object.fromEntries(entries) as Record<FeedKey, Feed>;
}
