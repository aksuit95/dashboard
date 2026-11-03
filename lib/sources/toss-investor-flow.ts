import type { MinerviniUniverse } from "@/config/minervini";
import { fetchIndexMembers } from "@/lib/sources/minervini";
import { investors, type InvestorPoint } from "@/lib/market/investor-flow";
import type { FlowStock } from "@/lib/sources/investor-flow";

const origin = "https://openapi.tossinvest.com";
let token: { value: string; expires: number } | undefined;
let pending: Promise<string> | undefined;
const flowCache = new Map<string, { points: InvestorPoint[]; until: number }>();
const marketCache = new Map<string, { value: TossMarketFlow; until: number }>();
// STOCK_TRADING_TREND is shared by all requests in this server process.
let lastSlot = Promise.resolve();
function waitForSlot() {
  const slot = lastSlot.then(() => new Promise<void>(resolve => setTimeout(resolve, 150)));
  lastSlot = slot.catch(() => {});
  return slot;
}
async function accessToken(fetcher: typeof fetch): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  if (pending) return pending;
  pending = (async () => {
    const id = process.env.TOSS_CLIENT_ID || process.env.toss_API_KEY, secret = process.env.TOSS_CLIENT_SECRET || process.env.toss_API_SECRET;
    if (!id || !secret) throw new Error("TOSS_CLIENT_ID와 TOSS_CLIENT_SECRET 설정이 필요합니다.");
    const response = await fetcher(`${origin}/oauth2/token`, { method: "POST", cache: "no-store", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`토스 인증 실패 (HTTP ${response.status}) · 인증정보와 허용 IP를 확인하세요.`);
    const data = await response.json();
    if (typeof data.access_token !== "string" || !Number.isFinite(Number(data.expires_in))) throw new Error("토스 토큰 응답 형식 오류");
    token = { value: data.access_token, expires: Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000 };
    return token.value;
  })();
  try { return await pending; } finally { pending = undefined; }
}
export function parseTossInvestorRecords(payload: unknown, through: string): InvestorPoint[] {
  const data = payload as { result?: { records?: unknown[] } };
  if (!Array.isArray(data?.result?.records)) throw new Error("토스 수급 응답 형식 오류");
  const seen = new Set<string>();
  return data.result.records.map(item => {
    if (!item || typeof item !== "object") throw new Error("토스 수급 행 오류");
    const row = item as Record<string, unknown>, date = String(row.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) throw new Error("토스 수급 날짜 오류");
    seen.add(date);
    const read = (key: string) => {
      const group = row[key] as { netBuyVolume?: unknown } | null;
      if (group == null) return null;
      const value = String(group.netBuyVolume ?? "");
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("토스 순매수 수량 오류");
      return Number(value);
    };
    return { date, individual: read("individual"), foreign: read("foreigner"), institution: read("institution") };
  }).filter(p => p.date <= through).sort((a, b) => a.date.localeCompare(b.date));
}
export type TossMarketFlow = { market: "KOSPI" | "KOSDAQ"; asOf: string; collectedAt: string; latestUpdatedAt: string | null; points: InvestorPoint[] };
export function parseTossMarketRecords(payload: unknown, through: string): { points: InvestorPoint[]; latestUpdatedAt: string | null } {
  const data = payload as { result?: { records?: unknown[] } };
  if (!Array.isArray(data?.result?.records)) throw new Error("토스 시장 수급 응답 형식 오류");
  const seen = new Set<string>();
  let latestUpdatedAt: string | null = null, latestDate = "";
  const points = data.result.records.map(item => {
    if (!item || typeof item !== "object") throw new Error("토스 시장 수급 행 오류");
    const row = item as Record<string, unknown>, date = String(row.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || seen.has(date)) throw new Error("토스 시장 수급 날짜 오류");
    seen.add(date);
    const read = (key: string) => {
      const group = row[key] as { buyAmount?: unknown; sellAmount?: unknown } | null;
      if (group == null) return null;
      const buy = String(group.buyAmount ?? ""), sell = String(group.sellAmount ?? "");
      if (!/^\d+$/.test(buy) || !/^\d+$/.test(sell) || !Number.isSafeInteger(Number(buy)) || !Number.isSafeInteger(Number(sell))) throw new Error("토스 시장 매매대금 형식 오류");
      return Number(buy) - Number(sell);
    };
    if (date <= through && date > latestDate) {
      latestDate = date;
      latestUpdatedAt = typeof row.updatedAt === "string" && Number.isFinite(Date.parse(row.updatedAt)) ? row.updatedAt : null;
    }
    return { date, individual: read("individual"), foreign: read("foreigner"), institution: read("institution") };
  }).filter(point => point.date <= through).sort((a, b) => a.date.localeCompare(b.date));
  return { points, latestUpdatedAt };
}
export async function loadTossMarketFlow(universe: MinerviniUniverse, asOf: string, fetcher: typeof fetch = fetch, previous?: TossMarketFlow): Promise<TossMarketFlow> {
  const market = universe === "kospi200" ? "KOSPI" : "KOSDAQ", key = `${market}:${asOf}`;
  const saved = !previous && marketCache.get(key);
  if (saved && saved.until > Date.now()) return saved.value;
  const bearer = await accessToken(fetcher);
  const start = new Date(`${asOf}T00:00:00Z`); start.setUTCFullYear(start.getUTCFullYear() - 1);
  const from = start.toISOString().slice(0, 10);
  // Reuse only a complete one-year snapshot ending on its stated session.
  const priorStart = previous && new Date(`${previous.asOf}T00:00:00Z`);
  priorStart?.setUTCFullYear(priorStart.getUTCFullYear() - 1);
  const first = previous?.points?.[0], last = previous?.points?.at(-1);
  const complete = previous?.market === market && previous.asOf < asOf && last?.date === previous.asOf &&
    first && priorStart && Date.parse(`${first.date}T00:00:00Z`) <= priorStart.getTime() + 7 * 86400000 &&
    previous.points.every((p, i) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && (!i || previous.points[i - 1].date < p.date) && investors.every(k => p[k] == null || Number.isSafeInteger(p[k]))) &&
    investors.every(k => last[k] != null) && last.date >= from;
  const prior = complete ? previous : undefined;
  const cutoff = prior?.points.at(-1)?.date ?? from;
  let until: string | null = asOf, latestUpdatedAt: string | null = null;
  const all: InvestorPoint[] = [];
  for (let page = 0; page < 5 && until; page++) {
    // Calendar days are an upper bound on missing trading days, including holidays.
    const missingDays = Math.ceil((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${cutoff}T00:00:00Z`)) / 86400000);
    const count = prior ? Math.max(1, Math.min(100, missingDays)) : 100;
    const response = await fetcher(`${origin}/api/v1/market-indicators/${market}/investor-trading?interval=1d&count=${count}&until=${until}`, {
      headers: { authorization: `Bearer ${bearer}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`토스 시장 수급 HTTP ${response.status}`);
    const payload = await response.json() as { result?: { nextUntil?: unknown } };
    const parsed = parseTossMarketRecords(payload, asOf);
    if (!latestUpdatedAt) latestUpdatedAt = parsed.latestUpdatedAt;
    if (parsed.points.some(p => all.some(previous => previous.date === p.date))) throw new Error("토스 시장 수급 페이지 날짜 중복");
    all.push(...parsed.points);
    if (parsed.points.some(p => p.date <= cutoff)) { until = null; break; }
    // A short page covers all available observations in the requested range.
    if (prior && parsed.points.length < count) { until = null; break; }
    if (prior && missingDays <= 100) { until = null; break; }
    const next = payload.result?.nextUntil;
    if (next == null) { until = null; break; }
    if (typeof next !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(next) || next >= until) throw new Error("토스 시장 수급 다음 페이지 오류");
    until = next;
  }
  if (until) throw new Error("토스 시장 수급 1년 이력 페이지 확인 실패");
  const merged = new Map((prior?.points ?? []).map(p => [p.date, p]));
  for (const point of all) merged.set(point.date, point);
  const points = [...merged.values()].filter(p => p.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) throw new Error("토스 시장 수급 데이터가 없습니다.");
  const result: TossMarketFlow = { market, asOf, collectedAt: new Date().toISOString(), latestUpdatedAt, points };
  // Cache only a complete latest observation; do not lock in a provisional or delayed result.
  if (!previous && points.at(-1)?.date === asOf && investors.every(k => points.at(-1)?.[k] != null)) marketCache.set(key, { value: result, until: Date.now() + 5 * 60_000 });
  return result;
}
export type TossFlowStock = { code: string; name: string; points: InvestorPoint[]; error: string | null };
export async function loadTossInvestorFlows(universe: MinerviniUniverse, view: "index" | "stocks", asOf: string, stocks: FlowStock[], fetcher: typeof fetch = fetch) {
  const selected = view === "index" ? await fetchIndexMembers(universe, fetcher) : stocks;
  if (view === "stocks" && selected.length !== 10) throw new Error("시총 상위 10개 종목 확인 실패");
  const bearer = await accessToken(fetcher);
  const rows: TossFlowStock[] = [];
  for (let i = 0; i < selected.length; i += 4) {
    rows.push(...await Promise.all(selected.slice(i, i + 4).map(async stock => {
      try {
        const cacheKey = `${stock.code}:${asOf}`;
        const cached = flowCache.get(cacheKey);
        if (cached && cached.until > Date.now()) return { code: stock.code, name: stock.name, points: cached.points, error: null };
        const url = `${origin}/api/v1/stocks/${encodeURIComponent(stock.code)}/investor-trading?count=100&until=${asOf}`;
        let response: Response | undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
          await waitForSlot();
          response = await fetcher(url, { headers: { authorization: `Bearer ${bearer}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
          if (response.status !== 429) break;
          await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
        }
        if (!response) throw new Error("토스 수급 응답 없음");
        if (!response.ok) throw new Error(`토스 수급 HTTP ${response.status}`);
        const points = parseTossInvestorRecords(await response.json(), asOf);
        const error = points.at(-1)?.date === asOf && investors.every(k => points.at(-1)?.[k] != null) ? null : `${asOf} 확정 수급 미수신`;
        if (!error) flowCache.set(cacheKey, { points, until: Date.now() + 5 * 60_000 });
        return { code: stock.code, name: stock.name, points, error };
      } catch (error) { return { code: stock.code, name: stock.name, points: [], error: error instanceof Error ? error.message : "토스 수급 조회 실패" }; }
    })));
  }
  return { universe, view, asOf, collectedAt: new Date().toISOString(), membershipBasis: view === "index" ? "CURRENT" : "MARKET_CAP_AS_OF", rows };
}
