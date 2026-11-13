import { sectorNames } from "@/config/sectors";
import type { SectorSnapshot } from "@/lib/sources/sector-returns";

export function risingStreak(values: (number | null | undefined)[]) {
  let count = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) return { count, incomplete: true };
    if (value <= 0) return { count, incomplete: false };
    count++;
  }
  return { count, incomplete: true };
}

/** Snapshots must be supplied newest first, with null for a missing market session. */
export function buildRisingBoard(snapshots: (SectorSnapshot | null)[]) {
  const latest = snapshots[0];
  if (!latest) throw new Error("최신 섹터 자료가 없습니다.");
  const maps = snapshots.map(s => s ? new Map(s.rows.map(row => [row.code, row])) : null);
  const stocks = latest.rows.map(row => ({ ...row, streak: risingStreak(maps.map(map => map?.get(row.code)?.returns["1d"])) }));
  const sectors = sectorNames.flatMap(sector => {
    const members = latest.rows.filter(row => row.sector === sector);
    if (!members.length) return [];
    const daily = maps.map(map => {
      const values = members.map(row => map?.get(row.code)?.returns["1d"]);
      // A changing sample can create a false rise, so require every current member.
      return values.every((v): v is number => v != null && Number.isFinite(v)) ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });
    const valid = members.filter(row => row.returns["1d"] != null);
    const week = members.map(row => row.returns["1w"]).filter((v): v is number => v != null && Number.isFinite(v));
    return [{ sector, count: members.length, streak: risingStreak(daily), daily: daily[0], breadth: valid.length ? valid.filter(row => row.returns["1d"]! > 0).length / valid.length * 100 : null, coverage: valid.length, week: week.length ? week.reduce((a,b) => a+b, 0) / week.length : null, weekCoverage: week.length }];
  });
  return { stocks, sectors };
}
