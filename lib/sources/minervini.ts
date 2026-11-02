import { type MinerviniBar, type MinerviniStock, screenMinervini } from "@/lib/market/minervini";
import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";

export type MinerviniSnapshot = { universe?: MinerviniUniverse; asOf: string; fetchedAt: string; membershipAt: string; universeSize: number; rankedSize: number; rows: ReturnType<typeof screenMinervini> };
type FetchLike = typeof fetch;

export function parseMinerviniMembers(payload: unknown, universe: MinerviniUniverse = "kospi200"): { stocks: MinerviniStock[]; hasNext: boolean } {
  const spec = minerviniUniverses[universe];
  const result = (payload as { isSuccess?: boolean; result?: { stocks?: Record<string, unknown>[]; hasNext?: boolean } })?.result;
  if ((payload as { isSuccess?: boolean })?.isSuccess !== true || !Array.isArray(result?.stocks) || typeof result.hasNext !== "boolean") throw new Error(`${spec.name} 구성종목 응답 형식 오류`);
  const stocks = result.stocks.map(s => {
    if (s.marketType !== spec.market || s.stockEndType !== "stock" || !/^[0-9A-Z]{6}$/.test(String(s.itemCode)) || typeof s.name !== "string" || typeof s.marketValue !== "number" || !Number.isFinite(s.marketValue) || s.marketValue <= 0) throw new Error(`${spec.name} 구성종목 필드 오류`);
    return { code: String(s.itemCode), name: s.name, marketCap: s.marketValue, tradable: s.tradableStatus === "tradable" };
  });
  return { stocks, hasNext: result.hasNext };
}
export const parseKospi200 = (payload: unknown) => parseMinerviniMembers(payload, "kospi200");

/** NAVER's OHLCV feed used by FinanceDataReader. Preserve zero volume for suspension filtering. */
export function parseMinerviniBars(xml: string, through: string): MinerviniBar[] {
  const bars = new Map<string, MinerviniBar>();
  for (const match of xml.matchAll(/<item\s+data=["']([^"']+)["']\s*\/?\s*>/g)) {
    const fields = match[1].split("|");
    if (fields.length !== 6 || !/^\d{8}$/.test(fields[0])) throw new Error("일봉 형식 오류");
    const date = `${fields[0].slice(0, 4)}-${fields[0].slice(4, 6)}-${fields[0].slice(6)}`;
    if (date > through) continue;
    const [open, high, low, close, volume] = fields.slice(1).map(v => v.trim() ? Number(v) : NaN);
    if (![open, high, low, close, volume].every(Number.isFinite) || close <= 0 || volume < 0) throw new Error("일봉 값 오류");
    // Suspensions can carry zero OHLC and a carried-forward close.
    const bar = volume === 0 && open === 0 && high === 0 && low === 0
      ? { date, open: close, high: close, low: close, close, volume }
      : { date, open, high, low, close, volume };
    if (bar.low <= 0 || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) throw new Error("일봉 고저가 오류");
    bars.set(date, bar);
  }
  const sorted = [...bars.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) throw new Error("일봉 데이터 없음");
  return sorted;
}

async function request(fetchImpl: FetchLike, url: string) {
  const response = await fetchImpl(url, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`시세 수집 HTTP ${response.status}`);
  return response;
}

export async function fetchMinerviniSnapshot(asOf: string, fetchImpl: FetchLike = fetch, now = new Date(), universe: MinerviniUniverse = "kospi200"): Promise<MinerviniSnapshot> {
  const spec = minerviniUniverses[universe];
  const members = new Map<string, MinerviniStock>();
  let finished = false;
  for (let page = 1; page <= 6; page++) {
    const data = parseMinerviniMembers(await (await request(fetchImpl, `https://m.stock.naver.com/front-api/stock/domestic/index/enrollStock/list?code=${spec.indexCode}&page=${page}&pageSize=50`)).json(), universe);
    for (const stock of data.stocks) {
      if (members.has(stock.code)) throw new Error("구성종목 중복 · 페이지 재조회 필요");
      members.set(stock.code, stock);
    }
    if (!data.hasNext) { finished = true; break; }
  }
  // Corporate actions can temporarily add members; never silently use a top-50 list.
  if (!finished || members.size < spec.minSize || members.size > spec.maxSize) throw new Error(`${spec.name} 전체 구성 확인 실패 (${members.size}개)`);
  const stocks = [...members.values()];
  const inputs: { stock: MinerviniStock; bars: MinerviniBar[] }[] = [];
  // Bounded batches prevent 200 simultaneous upstream connections.
  for (let i = 0; i < stocks.length; i += 8) {
    const batch = await Promise.all(stocks.slice(i, i + 8).map(async stock => {
      const response = await request(fetchImpl, `https://fchart.stock.naver.com/sise.nhn?symbol=${stock.code}&timeframe=day&count=360&requestType=0`);
      const bars = parseMinerviniBars(await response.text(), asOf);
      if (bars.at(-1)?.date !== asOf) throw new Error(`${stock.code} ${asOf} 종가 미반영`);
      return { stock, bars };
    }));
    inputs.push(...batch);
  }
  const rows = screenMinervini(inputs, universe);
  return { universe, asOf, fetchedAt: now.toISOString(), membershipAt: now.toISOString(), universeSize: members.size, rankedSize: rows.filter(r => r.rs != null).length, rows };
}
