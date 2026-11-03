import { unstable_cache } from "next/cache";
import type { MinerviniUniverse } from "@/config/minervini";
import { getDb } from "@/lib/db/client";
import { minerviniSession } from "@/lib/market/minervini-session";
import { loadSectors, loadSectorsAtDate, readSectors, saveSectors, type SectorBoard } from "./sector-returns-daily";
import { sectorSnapshotVersion } from "./sector-returns";

const cached = unstable_cache(async (session: string, universe: MinerviniUniverse) => {
  const board = await loadSectors(getDb(), new Date(), fetch, universe);
  if (board.stale || !board.snapshot || board.snapshot.asOf !== session) throw new Error(board.error ?? "종가 미반영");
  return board;
}, ["sector-returns", String(sectorSnapshotVersion)], { revalidate: false });
const active = new Map<MinerviniUniverse, Promise<SectorBoard>>();
const failures = new Map<MinerviniUniverse, { until: number; board: SectorBoard }>();
const cachedHistory = unstable_cache(async (session: string, universe: MinerviniUniverse) => {
  const board = await loadSectorsAtDate(getDb(), session, universe);
  if (board.stale || !board.snapshot) throw new Error(board.error ?? "과거 종가 미반영");
  return board;
}, ["sector-returns-history", String(sectorSnapshotVersion)], { revalidate: false });
const historicalActive = new Map<string, Promise<SectorBoard>>();
export async function loadHistoricalSectors(universe: MinerviniUniverse, session: string): Promise<SectorBoard> {
  const key = `${universe}:${session}`;
  const pending = historicalActive.get(key);
  if (pending) return pending;
  const promise = (async (): Promise<SectorBoard> => {
    try {
      const board = await cachedHistory(session, universe);
      if (board.snapshot) saveSectors(getDb(), board.snapshot);
      return board;
    } catch (error) {
      return { snapshot: readSectors(getDb(), universe, session), stale: true, expectedDate: session, error: error instanceof Error ? error.message : "과거 등락률 수집 실패" };
    } finally { historicalActive.delete(key); }
  })();
  historicalActive.set(key, promise);
  return promise;
}
export async function loadDailySectors(universe: MinerviniUniverse): Promise<SectorBoard> {
  let session: string;
  try { session = minerviniSession(); }
  catch (error) { return { snapshot: readSectors(getDb(), universe), stale: true, expectedDate: null, error: (error as Error).message }; }
  const failure = failures.get(universe);
  if (failure && failure.until > Date.now() && failure.board.expectedDate === session) return failure.board;
  const existing = active.get(universe);
  if (existing) return existing;
  const promise = (async (): Promise<SectorBoard> => {
    try {
      const board = await cached(session, universe);
      if (board.snapshot) saveSectors(getDb(), board.snapshot);
      failures.delete(universe);
      return board;
    } catch (error) {
      const board = { snapshot: readSectors(getDb(), universe), stale: true, expectedDate: session, error: error instanceof Error ? error.message : "수집 실패" };
      failures.set(universe, { until: Date.now() + 60_000, board });
      return board;
    } finally { active.delete(universe); }
  })();
  active.set(universe, promise);
  return promise;
}
