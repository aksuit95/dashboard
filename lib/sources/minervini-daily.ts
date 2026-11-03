import type { AppDatabase } from "@/lib/db/client";
import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";
import { minerviniSession } from "@/lib/market/minervini-session";
import { fetchMinerviniSnapshot, minerviniSnapshotVersion, type MinerviniSnapshot } from "@/lib/sources/minervini";

export type MinerviniBoard = { snapshot: MinerviniSnapshot | null; stale: boolean; error: string | null; expectedDate: string | null };
function ensureTable(db: AppDatabase, universe: MinerviniUniverse) {
  const table = minerviniUniverses[universe].table;
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (as_of TEXT PRIMARY KEY, payload TEXT NOT NULL)`);
  return table;
}
export function readMinervini(db: AppDatabase, universe: MinerviniUniverse = "kospi200"): MinerviniSnapshot | null {
  const table = ensureTable(db, universe);
  const row = db.prepare(`SELECT payload FROM ${table} ORDER BY as_of DESC LIMIT 1`).get() as { payload: string } | undefined;
  const snapshot = row ? JSON.parse(row.payload) as MinerviniSnapshot : null;
  return snapshot?.priceBasis === "KRX_REGULAR_CLOSE" && snapshot.version === minerviniSnapshotVersion ? snapshot : null;
}
export function saveMinervini(db: AppDatabase, snapshot: MinerviniSnapshot, universe: MinerviniUniverse = "kospi200") {
  if (snapshot.universe && snapshot.universe !== universe) throw new Error("분석 유니버스 불일치");
  const table = ensureTable(db, universe);
  db.prepare(`INSERT OR REPLACE INTO ${table}(as_of,payload) VALUES (?,?)`).run(snapshot.asOf, JSON.stringify(snapshot));
}
const active = new WeakMap<AppDatabase, Map<MinerviniUniverse, Promise<MinerviniBoard>>>();
const failures = new WeakMap<AppDatabase, Map<MinerviniUniverse, { until: number; board: MinerviniBoard }>>();

/** Only complete, successful scans mark a session complete. Failures keep the last snapshot and retry after a minute. */
export async function loadMinervini(db: AppDatabase, now = new Date(), fetchImpl: typeof fetch = fetch, universe: MinerviniUniverse = "kospi200"): Promise<MinerviniBoard> {
  if (!active.has(db)) active.set(db, new Map());
  if (!failures.has(db)) failures.set(db, new Map());
  const pending = active.get(db)!;
  const failed = failures.get(db)!;
  let expectedDate: string;
  try { expectedDate = minerviniSession(now); }
  catch (error) { return { snapshot: readMinervini(db, universe), stale: true, expectedDate: null, error: (error as Error).message }; }
  const saved = readMinervini(db, universe);
  if (saved?.asOf === expectedDate) return { snapshot: saved, stale: false, expectedDate, error: null };
  const failure = failed.get(universe);
  if (failure && failure.until > now.getTime() && failure.board.expectedDate === expectedDate) return failure.board;
  const existing = pending.get(universe);
  if (existing) return existing;
  const promise = (async (): Promise<MinerviniBoard> => {
    try {
      const snapshot = await fetchMinerviniSnapshot(expectedDate, fetchImpl, now, universe);
      saveMinervini(db, snapshot, universe);
      failed.delete(universe);
      return { snapshot, stale: false, expectedDate, error: null };
    } catch (error) {
      const board = { snapshot: saved, stale: true, expectedDate, error: error instanceof Error ? error.message : "미너비니 수집 실패" };
      failed.set(universe, { until: now.getTime() + 60_000, board });
      return board;
    } finally { pending.delete(universe); }
  })();
  pending.set(universe, promise);
  return promise;
}
