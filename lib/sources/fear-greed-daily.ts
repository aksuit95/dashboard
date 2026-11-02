import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/db/client";
import { fearGreedDay, loadFearGreed, readFearGreed, type FearGreedBoard } from "@/lib/sources/fear-greed";

// The day argument is part of Next's shared Data Cache key. Vercel instances and
// the scheduled job reuse the same successful result without relying on /tmp.
const cachedDaily = unstable_cache(async (_day: string) => {
  const board = await loadFearGreed(getDb());
  if (board.stale || !board.snapshot) throw new Error(board.error ?? "CNN unavailable");
  return board;
}, ["cnn-fear-greed-daily-v1"], { revalidate: false });

let active: { day: string; promise: Promise<FearGreedBoard> } | null = null;
let failure: { day: string; until: number; board: FearGreedBoard } | null = null;

export async function loadDailyFearGreed(): Promise<FearGreedBoard> {
  const day = fearGreedDay();
  if (failure?.day === day && Date.now() < failure.until) return failure.board;
  if (active?.day === day) return active.promise;
  const promise = (async () => {
    try {
      const board = await cachedDaily(day);
      failure = null;
      return board;
    } catch {
      const saved = readFearGreed(getDb());
      const board: FearGreedBoard = {
        ...saved, stale: true,
        error: saved.snapshot ? "CNN 연결 실패 · 마지막 수집값을 표시합니다." : "CNN 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
      // Failures are not cached as the day's successful result; allow retry.
      failure = { day, until: Date.now() + 60_000, board };
      return board;
    } finally {
      active = null;
    }
  })();
  active = { day, promise };
  return promise;
}
