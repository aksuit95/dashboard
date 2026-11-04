import fs from "node:fs/promises";
import path from "node:path";
import { isMinerviniUniverse, type MinerviniUniverse } from "@/config/minervini";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { minerviniSession } from "@/lib/market/minervini-session";
import { collectInvestorDaily, initInvestorDaily, readInvestorDaily } from "./investor-flow-daily";
import type { InvestorBoard } from "./investor-flow";

type Run = { as_of: string; started_at: string; finished_at: string | null; error: string | null };
type Snapshot = { as_of: string; universe: MinerviniUniverse; view: InvestorBoard["view"]; board: string; toss: string | null; error: string | null };
type Publication = { version: 1; runs: Run[]; snapshots: Snapshot[] };
export const investorPublicationPath = path.join(process.cwd(), "data", "investor-flow", "board.json");

export function validateInvestorPublication(value: unknown): Publication {
  const data = value as Publication;
  if (data?.version !== 1 || !Array.isArray(data.runs) || !Array.isArray(data.snapshots)) throw new Error("배포용 수급 JSON 형식 오류");
  const dates = new Set<string>();
  for (const run of data.runs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(run.as_of) || dates.has(run.as_of) || !Number.isFinite(Date.parse(run.started_at)) || !run.finished_at || !Number.isFinite(Date.parse(run.finished_at))) throw new Error("배포용 수급 실행 기록 오류");
    dates.add(run.as_of);
  }
  const keys = new Set<string>();
  for (const row of data.snapshots) {
    const key = `${row.as_of}:${row.universe}:${row.view}`;
    if (!dates.has(row.as_of) || !isMinerviniUniverse(row.universe) || !["index", "stocks"].includes(row.view) || keys.has(key)) throw new Error("배포용 수급 기준일·화면 오류");
    keys.add(key);
    const board = JSON.parse(row.board) as InvestorBoard;
    if (board.version !== 1 || board.priceBasis !== "KRX_REGULAR_CLOSE" || board.asOf !== row.as_of || board.universe !== row.universe || board.view !== row.view || !Number.isFinite(Date.parse(board.fetchedAt))) throw new Error("배포용 수급 KRX 가격 기준 오류");
    if (row.toss && JSON.parse(row.toss).asOf !== row.as_of) throw new Error("배포용 수급 원본 기준일 불일치");
  }
  return data;
}

export async function readInvestorPublication(file = investorPublicationPath) {
  try { return validateInvestorPublication(JSON.parse(await fs.readFile(file, "utf8"))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}

/** Static publication is shared by all deployment instances; reads never collect. */
export async function readPublishedInvestorDaily(universe: MinerviniUniverse, view: InvestorBoard["view"], now = new Date(), date?: string, file = investorPublicationPath) {
  const data = await readInvestorPublication(file);
  if (!data) return readInvestorDaily(getDb(), universe, view, now, date);
  const expected = minerviniSession(now);
  const candidates = data.snapshots.filter(s => s.universe === universe && s.view === view && s.as_of <= expected && (!date || s.as_of === date)).sort((a, b) => b.as_of.localeCompare(a.as_of));
  // When today's quotes are missing, prefer a complete older snapshot and keep its actual date.
  const row = candidates.find(s => !s.error && s.toss && (JSON.parse(s.board) as InvestorBoard).equity) ?? candidates[0];
  if (!row) throw new Error("저장된 수급 자료가 없습니다. 거래일 16:00 KST 예약 수집 후 제공됩니다.");
  return { board: JSON.parse(row.board) as InvestorBoard, toss: row.toss ? JSON.parse(row.toss) : null, error: row.error, expected };
}

export async function exportInvestorPublication(db: AppDatabase, now = new Date(), file = investorPublicationPath, collect = collectInvestorDaily, retryFailed = false) {
  initInvestorDaily(db);
  const previous = await readInvestorPublication(file);
  // Restore the daily claims on a fresh Actions runner, including failures.
  for (const run of previous?.runs ?? []) db.prepare("INSERT OR IGNORE INTO investor_flow_daily_runs(as_of, started_at, finished_at, error) VALUES (?, ?, ?, ?)").run(run.as_of, run.started_at, run.finished_at, run.error);
  for (const row of previous?.snapshots ?? []) db.prepare("INSERT OR IGNORE INTO investor_flow_daily_snapshots(as_of, universe, view, board, toss, error) VALUES (?, ?, ?, ?, ?, ?)").run(row.as_of, row.universe, row.view, row.board, row.toss, row.error);
  const result = await collect(db, now, retryFailed);
  const runs = db.prepare("SELECT * FROM investor_flow_daily_runs ORDER BY as_of DESC LIMIT 30").all() as Run[];
  if (!runs.length) return { ...result, changed: false };
  const dates = new Set(runs.map(r => r.as_of));
  const snapshots = (db.prepare("SELECT * FROM investor_flow_daily_snapshots ORDER BY as_of, universe, view").all() as Snapshot[]).filter(row => dates.has(row.as_of));
  const data = validateInvestorPublication({ version: 1, runs, snapshots });
  const contents = JSON.stringify(data) + "\n";
  if (previous && JSON.stringify(previous) + "\n" === contents) return { ...result, changed: false };
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, contents, { flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
  return { ...result, changed: true };
}
