import { sectorNames, type Sector } from "@/config/sectors";
import type { MinerviniStock } from "@/lib/market/minervini";

export const returnPeriods = [
  { id: "1d", label: "일간", days: 1 }, { id: "1w", label: "1W", days: 5 },
  { id: "1m", label: "1M", days: 21 }, { id: "3m", label: "3M", days: 63 },
  { id: "6m", label: "6M", days: 126 }, { id: "1y", label: "1Y", days: 252 },
] as const;
export type ReturnPeriod = typeof returnPeriods[number]["id"];
export type Returns = Record<ReturnPeriod, number | null>;
export type SectorStock = MinerviniStock & { sector: Sector; industry: string | null; price: number | null; returns: Returns };
export function calculateReturns(bars: { close: number | null }[]): Returns {
  const last = bars.at(-1)?.close;
  return Object.fromEntries(returnPeriods.map(p => {
    const base = bars[bars.length - 1 - p.days]?.close;
    return [p.id, last != null && Number.isFinite(last) && last > 0 && base != null && Number.isFinite(base) && base > 0 ? (last / base - 1) * 100 : null];
  })) as Returns;
}
export function summarizeSectors(rows: SectorStock[]) {
  return sectorNames.map(sector => {
    const members = rows.filter(r => r.sector === sector);
    const coverage = {} as Record<ReturnPeriod, number>;
    const returns = Object.fromEntries(returnPeriods.map(p => {
      const values = members.flatMap(r => r.returns[p.id] == null ? [] : [r.returns[p.id]!]);
      coverage[p.id] = values.length;
      return [p.id, values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null];
    })) as Returns;
    return { sector, count: members.length, returns, coverage };
  });
}
