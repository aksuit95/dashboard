import { minerviniUniverseIds, type MinerviniUniverse } from "@/config/minervini";
import type { AppDatabase } from "@/lib/db/client";
import { minerviniSession } from "@/lib/market/minervini-session";
import { loadInvestorBoard, type InvestorBoard } from "./investor-flow";
import { collectInvestorToss } from "./investor-flow-toss";

export function initInvestorDaily(db: AppDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS investor_flow_daily_runs (
    as_of TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, error TEXT
  );
  CREATE TABLE IF NOT EXISTS investor_flow_daily_snapshots (
    as_of TEXT NOT NULL, universe TEXT NOT NULL, view TEXT NOT NULL,
    board TEXT NOT NULL, toss TEXT, error TEXT,
    PRIMARY KEY (as_of, universe, view)
  )`);
}

export function readInvestorDaily(db: AppDatabase, universe: MinerviniUniverse, view: InvestorBoard["view"], now = new Date(), date?: string) {
  initInvestorDaily(db);
  const expected = minerviniSession(now);
  const row = db.prepare(`SELECT board, toss, error FROM investor_flow_daily_snapshots
    WHERE universe = ? AND view = ? AND as_of <= ? ${date ? "AND as_of = ?" : ""}
    ORDER BY as_of DESC LIMIT 1`).get(...[universe, view, expected, ...(date ? [date] : [])]) as { board: string; toss: string | null; error: string | null } | undefined;
  if (!row) throw new Error("저장된 수급 자료가 없습니다. 거래일 16:00 KST 예약 수집 후 제공됩니다.");
  return { board: JSON.parse(row.board) as InvestorBoard, toss: row.toss ? JSON.parse(row.toss) : null, error: row.error, expected };
}

/** Keep completed successes; scheduled recovery can retry only a finished failed run. */
export async function collectInvestorDaily(db: AppDatabase, now = new Date(), retryFailed = false, recoverPreviousSession = false) {
  initInvestorDaily(db);
  const asOf = minerviniSession(now);
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  if (asOf !== today && !recoverPreviousSession) return { ok: true, skipped: true, asOf };
  if (retryFailed) db.prepare("DELETE FROM investor_flow_daily_runs WHERE as_of = ? AND finished_at IS NOT NULL AND error IS NOT NULL").run(asOf);
  const claim = db.prepare("INSERT OR IGNORE INTO investor_flow_daily_runs(as_of, started_at) VALUES (?, ?)").run(asOf, now.toISOString());
  if (!claim.changes) {
    const run = db.prepare("SELECT error FROM investor_flow_daily_runs WHERE as_of = ?").get(asOf) as { error: string | null };
    return { ok: !run.error, skipped: true, asOf, error: run.error };
  }
  const errors: string[] = [];
  try {
    for (const universe of minerviniUniverseIds) {
      for (const view of ["index", "stocks"] as const) {
        try {
          const saved = db.prepare("SELECT error, toss FROM investor_flow_daily_snapshots WHERE as_of = ? AND universe = ? AND view = ?").get(asOf, universe, view) as { error: string | null; toss: string | null } | undefined;
          if (retryFailed && saved && !saved.error && saved.toss) continue;
          const board = await loadInvestorBoard(db, universe, view, now);
          let toss: Awaited<ReturnType<typeof collectInvestorToss>> | null = null;
          let error: string | null = null;
          try { toss = await collectInvestorToss(db, universe, view, board); }
          catch (e) { error = e instanceof Error ? e.message : "수급 수집 실패"; }
          const problems = [board.equityError, error, toss && "priceError" in toss ? toss.priceError : null,
            toss && "rows" in toss ? toss.rows.find(row => row.error)?.error : null];
          if (toss && "points" in toss && toss.points.at(-1)?.date !== asOf) problems.push(`${asOf} 시장 수급 미발표`);
          error = problems.filter(Boolean).join(" · ") || null;
          db.prepare("INSERT OR REPLACE INTO investor_flow_daily_snapshots(as_of, universe, view, board, toss, error) VALUES (?, ?, ?, ?, ?, ?)")
            .run(asOf, universe, view, JSON.stringify(board), toss ? JSON.stringify(toss) : null, error);
          if (error) errors.push(`${universe}:${view}: ${error}`);
        } catch (e) { errors.push(`${universe}:${view}: ${e instanceof Error ? e.message : "수집 실패"}`); }
      }
    }
  } finally {
    db.prepare("UPDATE investor_flow_daily_runs SET finished_at = ?, error = ? WHERE as_of = ?")
      .run(new Date().toISOString(), errors.join(" · ") || null, asOf);
  }
  return { ok: !errors.length, skipped: false, asOf, error: errors.join(" · ") || null };
}
