import { unstable_cache } from "next/cache";
import { type MinerviniUniverse } from "@/config/minervini";
import { getDb } from "@/lib/db/client";
import { minerviniSession } from "@/lib/market/minervini-session";
import { loadMinervini, readMinervini, saveMinervini, type MinerviniBoard } from "@/lib/sources/minervini-daily";

const cachedDaily = unstable_cache(async (_session: string, universe: MinerviniUniverse) => {
  const board = await loadMinervini(getDb(), new Date(), fetch, universe);
  if (board.stale || !board.snapshot || board.snapshot.asOf !== _session) throw new Error(board.error ?? "종가 미반영");
  return board;
}, ["kr-minervini-v4-krx-1530"], { revalidate: false });

const active = new Map<MinerviniUniverse, Promise<MinerviniBoard>>();
const failures = new Map<MinerviniUniverse, { until: number; board: MinerviniBoard }>();
export async function loadDailyMinervini(universe: MinerviniUniverse = "kospi200"): Promise<MinerviniBoard> {
  let session: string;
  try { session = minerviniSession(); }
  catch (error) { return { snapshot: readMinervini(getDb(), universe), stale: true, expectedDate: null, error: (error as Error).message }; }
  const failure = failures.get(universe);
  if (failure && failure.until > Date.now() && failure.board.expectedDate === session) return failure.board;
  const existing = active.get(universe);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const board = await cachedDaily(session, universe);
      if (board.snapshot) saveMinervini(getDb(), board.snapshot, universe);
      failures.delete(universe);
      return board;
    } catch (error) {
      const board: MinerviniBoard = { snapshot: readMinervini(getDb(), universe), stale: true, expectedDate: session, error: error instanceof Error ? error.message : "수집 실패 · 잠시 후 재시도" };
      failures.set(universe, { until: Date.now() + 60_000, board });
      return board;
    } finally { active.delete(universe); }
  })();
  active.set(universe, promise);
  return promise;
}
