import fs from "node:fs/promises";
import path from "node:path";
import { minerviniUniverseIds, minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";
import { resolveSectorDate, sectorDateRange } from "@/lib/market/sector-date";
import { fetchSectorSnapshots, sectorSnapshotVersion, type SectorSnapshot } from "./sector-returns";

export type SectorPublication = { schemaVersion: 1; latestDate: string; publishedAt: string; snapshots: Record<MinerviniUniverse, Record<string, SectorSnapshot>> };
export const sectorPublicationPath = path.join(process.cwd(), "data", "sectors", "board.json");
export function publicationDates(now = new Date()) {
  const { latestDate } = sectorDateRange(now);
  return [...new Set(Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.parse(`${latestDate}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
    return resolveSectorDate(date, now);
  }))].sort();
}
export function validateSectorPublication(value: unknown): SectorPublication {
  const data = value as SectorPublication;
  if (data?.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.latestDate) || !Number.isFinite(Date.parse(data.publishedAt))) throw new Error("배포용 섹터 JSON 형식 오류");
  let dates: string[] | undefined;
  for (const universe of minerviniUniverseIds) {
    const snapshots = data.snapshots?.[universe];
    const keys = Object.keys(snapshots ?? {}).sort();
    if (!keys.length || keys.at(-1) !== data.latestDate || (dates && JSON.stringify(dates) !== JSON.stringify(keys))) throw new Error("두 지수의 배포 기준일 불일치");
    dates = keys;
    for (const [asOf, snapshot] of Object.entries(snapshots)) {
      const spec = minerviniUniverses[universe];
      if (snapshot.asOf !== asOf || snapshot.universe !== universe || snapshot.priceBasis !== "KRX_REGULAR_CLOSE" || snapshot.version !== sectorSnapshotVersion || !Array.isArray(snapshot.rows) || snapshot.rows.length < spec.minSize || snapshot.rows.length > spec.maxSize || new Set(snapshot.rows.map(row => row.code)).size !== snapshot.rows.length) throw new Error(`${universe} ${asOf} 배포 스냅샷 검증 실패`);
      for (const row of snapshot.rows) {
        if (row.price !== null && (!Number.isFinite(row.price) || row.price <= 0)) throw new Error("배포 종가 오류");
        for (const value of Object.values(row.returns)) if (value !== null && !Number.isFinite(value)) throw new Error("배포 등락률 오류");
      }
    }
  }
  return data;
}
export async function readSectorPublication(file = sectorPublicationPath): Promise<SectorPublication | null> {
  try { return validateSectorPublication(JSON.parse(await fs.readFile(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function exportSectorPublication(file = sectorPublicationPath, now = new Date(), collect = fetchSectorSnapshots, force = false) {
  const latestDate = sectorDateRange(now).latestDate;
  const previous = await readSectorPublication(file);
  if (previous?.latestDate === latestDate && !force) return { changed: false, publication: previous };
  if (previous && previous.latestDate > latestDate) throw new Error("배포 기준일 역행 · 기존 JSON을 유지합니다.");
  const dates = publicationDates(now);
  const snapshots = {} as SectorPublication["snapshots"];
  // Both universes must succeed before the single atomic publication file is replaced.
  for (const universe of minerviniUniverseIds) {
    const result = await collect(dates, universe, fetch, now);
    if (JSON.stringify(result.map(s => s.asOf).sort()) !== JSON.stringify(dates)) throw new Error("배포용 날짜 누락");
    snapshots[universe] = Object.fromEntries(result.map(snapshot => [snapshot.asOf, snapshot]));
  }
  const publication = validateSectorPublication({ schemaVersion: 1, latestDate, publishedAt: now.toISOString(), snapshots });
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(publication) + "\n", { flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
  return { changed: true, publication };
}
