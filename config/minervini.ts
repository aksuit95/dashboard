export const minerviniUniverses = {
  kospi200: { name: "코스피200", label: "KOSPI 200", indexCode: "KPI200", market: "KOSPI", size: 200, minSize: 190, maxSize: 210, table: "minervini_snapshots" },
  kosdaq150: { name: "코스닥150", label: "KOSDAQ 150", indexCode: "KQI150", market: "KOSDAQ", size: 150, minSize: 140, maxSize: 160, table: "minervini_kosdaq150_snapshots" },
} as const;
export type MinerviniUniverse = keyof typeof minerviniUniverses;
export const minerviniUniverseIds = Object.keys(minerviniUniverses) as MinerviniUniverse[];
export function isMinerviniUniverse(value: string): value is MinerviniUniverse {
  return Object.hasOwn(minerviniUniverses, value);
}
