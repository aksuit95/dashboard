import { semiconductorEtfs } from "@/lib/etf/config";
import type { Snapshot } from "@/lib/etf/holdings";
export type CommonChange = { code: string; name: string; entries: { etfCode: string; etfName: string; before: number; after: number; delta: number }[] };
export function commonChanges(pairs: { etfCode: string; before: Snapshot; after: Snapshot }[]) {
  const groups = { increase: new Map<string, CommonChange>(), decrease: new Map<string, CommonChange>() };
  for (const pair of pairs) {
    const etf = semiconductorEtfs.find(e => e.code === pair.etfCode);
    if (!etf || pair.before.asOf >= pair.after.asOf) continue;
    const before = new Map(pair.before.holdings.map(h => [h.code, h]));
    const after = new Map(pair.after.holdings.map(h => [h.code, h]));
    for (const code of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(code), b = after.get(code), old = a?.quantity ?? 0, next = b?.quantity ?? 0, delta = next - old;
      if (!delta) continue;
      const map = delta > 0 ? groups.increase : groups.decrease;
      const row = map.get(code) ?? {code, name: (b ?? a)!.name, entries: []};
      row.entries.push({etfCode: etf.code, etfName: etf.name, before: old, after: next, delta}); map.set(code, row);
    }
  }
  const finish = (map: Map<string, CommonChange>) => [...map.values()].filter(r => r.entries.length >= 2).sort((a,b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name, "ko"));
  return { increase: finish(groups.increase), decrease: finish(groups.decrease) };
}
