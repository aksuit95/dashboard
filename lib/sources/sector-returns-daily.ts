import type { AppDatabase } from "@/lib/db/client";
import type { MinerviniUniverse } from "@/config/minervini";
import { minerviniSession } from "@/lib/market/minervini-session";
import { fetchSectorSnapshot, sectorSnapshotVersion, type SectorSnapshot } from "./sector-returns";

export type SectorBoard = { snapshot: SectorSnapshot | null; indexDaily?: import("./sector-index").IndexDaily | null; marketCaps?: Record<string, number>; stale: boolean; expectedDate: string | null; error: string | null; requestedDate?: string; latestDate?: string; earliestDate?: string };
function ensureTable(db: AppDatabase) {
  db.exec("CREATE TABLE IF NOT EXISTS sector_return_snapshots (universe TEXT NOT NULL, as_of TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (universe, as_of))");
}
export function readSectors(db: AppDatabase, universe: MinerviniUniverse, asOf?: string): SectorSnapshot | null {
  ensureTable(db);
  const row = (asOf
    ? db.prepare("SELECT payload FROM sector_return_snapshots WHERE universe = ? AND as_of = ?").get(universe, asOf)
    : db.prepare("SELECT payload FROM sector_return_snapshots WHERE universe = ? ORDER BY as_of DESC LIMIT 1").get(universe)) as { payload: string } | undefined;
  const snapshot = row ? JSON.parse(row.payload) as SectorSnapshot : null;
  // Old NXT-inclusive snapshots must never be shown under a KRX-only label.
  return snapshot?.priceBasis === "KRX_REGULAR_CLOSE" ? snapshot : null;
}
export function saveSectors(db: AppDatabase, snapshot: SectorSnapshot) {
  ensureTable(db);
  db.prepare("INSERT OR REPLACE INTO sector_return_snapshots(universe, as_of, payload) VALUES (?, ?, ?)").run(snapshot.universe, snapshot.asOf, JSON.stringify(snapshot));
}

/** Historical requests never fall back to a different day's snapshot. */
export async function loadSectorsAtDate(db: AppDatabase, asOf: string, universe: MinerviniUniverse, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<SectorBoard> {
  const saved = readSectors(db, universe, asOf);
  if (saved?.version === sectorSnapshotVersion) return { snapshot: saved, stale: false, expectedDate: asOf, error: null };
  try {
    const snapshot = await fetchSectorSnapshot(asOf, universe, fetchImpl, now);
    saveSectors(db, snapshot);
    return { snapshot, stale: false, expectedDate: asOf, error: null };
  } catch (error) {
    return { snapshot: saved, stale: true, expectedDate: asOf, error: error instanceof Error ? error.message : "과거 등락률 수집 실패" };
  }
}
const active = new WeakMap<AppDatabase, Map<MinerviniUniverse, Promise<SectorBoard>>>();
const failures = new WeakMap<AppDatabase, Map<MinerviniUniverse, { until: number; board: SectorBoard }>>();
export async function loadSectors(db: AppDatabase, now = new Date(), fetchImpl: typeof fetch = fetch, universe: MinerviniUniverse = "kospi200"): Promise<SectorBoard> {
  const saved = readSectors(db, universe);
  let expectedDate: string;
  try { expectedDate = minerviniSession(now); }
  catch (error) { return { snapshot: saved, stale: true, expectedDate: null, error: (error as Error).message }; }
  if (saved?.asOf === expectedDate && saved.version === sectorSnapshotVersion) return { snapshot: saved, stale: false, expectedDate, error: null };
  if (!active.has(db)) active.set(db, new Map());
  if (!failures.has(db)) failures.set(db, new Map());
  const pending = active.get(db)!;
  const failed = failures.get(db)!;
  const failure = failed.get(universe);
  if (failure && failure.until > now.getTime() && failure.board.expectedDate === expectedDate) return failure.board;
  const existing = pending.get(universe);
  if (existing) return existing;
  const promise = (async (): Promise<SectorBoard> => {
    try {
      const snapshot = await fetchSectorSnapshot(expectedDate, universe, fetchImpl, now);
      saveSectors(db, snapshot);
      failed.delete(universe);
      return { snapshot, stale: false, expectedDate, error: null };
    } catch (error) {
      const board = { snapshot: saved, stale: true, expectedDate, error: error instanceof Error ? error.message : "섹터 등락률 수집 실패" };
      failed.set(universe, { until: now.getTime() + 60_000, board });
      return board;
    } finally { pending.delete(universe); }
  })();
  pending.set(universe, promise);
  return promise;
}
