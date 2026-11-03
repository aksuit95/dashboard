import type { MinerviniUniverse } from "@/config/minervini";
import { classifySector } from "@/config/sectors";
import { calculateReturns, type SectorStock } from "@/lib/market/sector-returns";
import { fetchIndexMembers } from "@/lib/sources/minervini";
import { fetchKrxDailyCloses } from "./krx-daily-prices";

export const sectorSnapshotVersion = 4;
export type SectorSnapshot = { version: number; priceBasis: "KRX_REGULAR_CLOSE"; universe: MinerviniUniverse; asOf: string; fetchedAt: string; rows: SectorStock[] };
async function request(url: string, fetchImpl: typeof fetch) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetchImpl(url, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`섹터 시세 수집 HTTP ${response.status}`);
      return response;
    } catch (error) { if (attempt >= 1) throw error; }
  }
}
export function parseIndustryGroups(payload: unknown): Map<string, string> {
  const data = payload as { groups?: { no: number; name: string }[]; totalCount?: number };
  if (!Array.isArray(data?.groups) || !data.groups.length || data.groups.length !== data.totalCount) throw new Error("업종 전체 목록 확인 실패");
  const groups = new Map<string, string>();
  for (const group of data.groups) {
    if (!Number.isInteger(group.no) || typeof group.name !== "string" || !group.name.trim() || groups.has(String(group.no))) throw new Error("업종 목록 형식 오류");
    groups.set(String(group.no), group.name);
  }
  return groups;
}
export async function fetchSectorSnapshot(asOf: string, universe: MinerviniUniverse, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<SectorSnapshot> {
  return (await fetchSectorSnapshots([asOf], universe, fetchImpl, now))[0];
}

/** Collect each stock's history once, then derive the published recent-date views. */
export async function fetchSectorSnapshots(dates: string[], universe: MinerviniUniverse, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<SectorSnapshot[]> {
  const sessions = [...new Set(dates)].sort();
  const asOf = sessions.at(-1);
  if (!asOf || sessions.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)) || Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${sessions[0]}T00:00:00Z`) > 40 * 86400000) throw new Error("섹터 과거 조회 범위 오류");
  const [stocks, groups] = await Promise.all([
    fetchIndexMembers(universe, fetchImpl),
    request("https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=100", fetchImpl).then(r => r.json()).then(parseIndustryGroups),
  ]);
  const rows = new Map(sessions.map(date => [date, [] as SectorStock[]]));
  for (let i = 0; i < stocks.length; i += 4) {
    const batch = await Promise.all(stocks.slice(i, i + 4).map(async stock => {
      const [bars, info] = await Promise.all([
        fetchKrxDailyCloses(stock.code, asOf, fetchImpl, sessions.length > 1 ? 300 : 253),
        request(`https://m.stock.naver.com/api/stock/${stock.code}/integration`, fetchImpl).then(r => r.json()) as Promise<{ itemCode?: string; industryCode?: string }>,
      ]);
      if (info.itemCode !== stock.code) throw new Error(`${stock.code} 업종 종목코드 불일치`);
      const industry = groups.get(String(info.industryCode)) ?? null;
      return sessions.map(date => {
        const history = bars.filter(bar => bar.date <= date);
        const available = history.at(-1)?.date === date && history.at(-1)?.close != null;
        return { date, row: { ...stock, industry, sector: classifySector(stock.code, industry), price: available ? history.at(-1)!.close : null, returns: calculateReturns(available ? history : []) } };
      });
    }));
    for (const stock of batch) for (const entry of stock) rows.get(entry.date)!.push(entry.row);
  }
  return sessions.map(asOf => ({ version: sectorSnapshotVersion, priceBasis: "KRX_REGULAR_CLOSE", universe, asOf, fetchedAt: now.toISOString(), rows: rows.get(asOf)! }));
}
