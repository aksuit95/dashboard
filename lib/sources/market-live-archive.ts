import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import { localDate } from "@/lib/market/market-hours";
import { KR_CSAT_2026 } from "@/config/market-calendar";
import { marketLiveCloseBasis, marketLiveTradingWindow } from "@/lib/market/market-live-session";
import { MARKET_LIVE_STALE_MS, type MarketLiveBoardData, type MarketLiveSector } from "@/lib/market/market-live";
import { packMarketLiveReplayStocks, summarizeMarketLiveArchiveSectors, type MarketLiveArchiveFrame, type MarketLiveArchiveResponse } from "@/lib/market/market-live-archive";
import { loadMarketLiveBoard, resolveMarketLiveSession } from "@/lib/sources/market-live";

export const marketLiveArchivePath = path.join(process.cwd(), "data", "market-live-archive.sqlite");
const table = "market_live_archive_v1";
const minuteMs = 60_000;

type ArchiveResult =
  | { status: "skipped" }
  | { status: "missing"; date: string; reason: string }
  | { status: "recorded" | "exists"; date: string; collectedAt: string; stocks: number };

export function isMarketLiveArchiveDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function minute(time: number) {
  return Math.floor(time / minuteMs) * minuteMs;
}

function openReader(file: string) {
  if (!existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)) return db;
  } catch (error) {
    db.close();
    throw error;
  }
  db.close();
  return null;
}

function unpackSectors(bytes: Uint8Array): MarketLiveSector[] {
  return JSON.parse(gunzipSync(bytes).toString("utf8")) as MarketLiveSector[];
}

export function readMarketLiveArchive(date?: string, file = marketLiveArchivePath, names?: ReadonlyMap<string, string>): MarketLiveArchiveResponse {
  if (date != null && !isMarketLiveArchiveDate(date)) throw new Error("올바른 거래일을 선택해 주세요.");
  const db = openReader(file);
  if (!db) return { dates: [], day: null };
  try {
    const dates = db.prepare(`SELECT DISTINCT trade_date FROM ${table} ORDER BY trade_date DESC`).all().map(row => String(row.trade_date));
    const selected = date ?? dates[0];
    if (!selected || !dates.includes(selected)) return { dates, day: null };
    const openAt = names && marketLiveTradingWindow(selected)?.openAt;
    const rows = db.prepare(`SELECT baseline_date, collected_at, sectors${openAt ? ", stocks" : ""} FROM ${table} WHERE trade_date = ? ORDER BY minute_ms`).all(selected);
    const frames: MarketLiveArchiveFrame[] = rows.map(row => ({
      collectedAt: String(row.collected_at), sectors: unpackSectors(row.sectors as Uint8Array),
      stocks: openAt ? JSON.parse(gunzipSync(row.stocks as Uint8Array).toString("utf8")) as MarketLiveArchiveFrame["stocks"] : [],
    }));
    return { dates, day: {
      date: selected, baselineDate: String(rows[0].baseline_date),
      frames: frames.map(({ stocks: _stocks, ...frame }) => frame),
      stockTape: names && openAt ? packMarketLiveReplayStocks(openAt, frames, names) : undefined,
    } };
  } finally { db.close(); }
}

export function readMarketLiveRotationFrame(date: string, baselineDate: string, from: number, through: number, file = marketLiveArchivePath): MarketLiveArchiveFrame | null {
  if (!isMarketLiveArchiveDate(date) || !isMarketLiveArchiveDate(baselineDate) || !Number.isFinite(from) || !Number.isFinite(through) || from > through) return null;
  const db = openReader(file);
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT collected_at, sectors, stocks FROM ${table}
      WHERE trade_date = ? AND baseline_date = ? AND minute_ms BETWEEN ? AND ? AND collected_ms BETWEEN ? AND ?
      ORDER BY minute_ms DESC LIMIT 1`).get(date, baselineDate, minute(from), minute(through), from, through);
    if (!row) return null;
    return {
      collectedAt: String(row.collected_at),
      sectors: unpackSectors(row.sectors as Uint8Array),
      stocks: JSON.parse(gunzipSync(row.stocks as Uint8Array).toString("utf8")) as MarketLiveArchiveFrame["stocks"],
    };
  } finally { db.close(); }
}

function archiveFrame(board: MarketLiveBoardData, time: number, earliest: number): MarketLiveArchiveFrame | null {
  const totals = new Map(board.sectors.map(sector => [sector.name, sector.total]));
  const seen = new Set<string>();
  const stocks = board.rotationStocks.filter(stock => {
    const quoted = Date.parse(stock.asOf);
    const key = `${stock.market}:${stock.code}`;
    if (!(quoted >= earliest && quoted <= time) || !totals.has(stock.sector) || seen.has(key)) return false;
    if (!/^[0-9A-Z]{6}$/.test(stock.code) || (stock.market !== "KOSPI" && stock.market !== "KOSDAQ")) return false;
    if (!Number.isFinite(stock.price) || stock.price <= 0 || !Number.isFinite(stock.close) || stock.close <= 0) return false;
    seen.add(key);
    return true;
  });
  if (!stocks.length) return null;
  return { collectedAt: new Date(time).toISOString(), sectors: summarizeMarketLiveArchiveSectors(totals, stocks), stocks };
}

function saveArchiveFrame(file: string, date: string, baselineDate: string, phase: "open" | "auction", frame: MarketLiveArchiveFrame) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    const create = `CREATE TABLE IF NOT EXISTS ${table} (
        trade_date TEXT NOT NULL,
        baseline_date TEXT NOT NULL CHECK (baseline_date < trade_date),
        minute_ms INTEGER NOT NULL,
        collected_ms INTEGER NOT NULL,
        collected_at TEXT NOT NULL,
        exchange TEXT NOT NULL CHECK (exchange = 'KRX'),
        time_zone TEXT NOT NULL CHECK (time_zone = 'Asia/Seoul'),
        session TEXT NOT NULL CHECK (session IN ('open', 'auction')),
        price_basis TEXT NOT NULL CHECK (price_basis = CASE
          WHEN baseline_date = '${KR_CSAT_2026}' THEN '${marketLiveCloseBasis(KR_CSAT_2026)}'
          ELSE 'KRX_REGULAR_CLOSE_1530_KST' END),
        sectors BLOB NOT NULL,
        stocks BLOB NOT NULL,
        PRIMARY KEY (trade_date, minute_ms)
      ) STRICT`;
    if (baselineDate === KR_CSAT_2026) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const schema = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table);
        if (schema && !String(schema.sql).includes(marketLiveCloseBasis(KR_CSAT_2026))) {
          const legacy = `${table}_legacy`;
          db.exec(`ALTER TABLE ${table} RENAME TO ${legacy}; ${create};
            INSERT INTO ${table} SELECT * FROM ${legacy}; DROP TABLE ${legacy};`);
        } else {
          db.exec(create);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } else {
      db.exec(create);
    }
    const time = Date.parse(frame.collectedAt);
    const result = db.prepare(`INSERT INTO ${table}
      (trade_date, baseline_date, minute_ms, collected_ms, collected_at, exchange, time_zone, session, price_basis, sectors, stocks)
      SELECT ?, ?, ?, ?, ?, 'KRX', 'Asia/Seoul', ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE trade_date = ? AND baseline_date <> ?)
      ON CONFLICT (trade_date, minute_ms) DO NOTHING`).run(
      date, baselineDate, minute(time), time, frame.collectedAt, phase, marketLiveCloseBasis(baselineDate),
      gzipSync(JSON.stringify(frame.sectors)), gzipSync(JSON.stringify(frame.stocks)), date, baselineDate,
    );
    if (result.changes === 0 && db.prepare(`SELECT 1 FROM ${table} WHERE trade_date = ? AND baseline_date <> ? LIMIT 1`).get(date, baselineDate)) {
      throw new Error("저장된 거래일과 새 기록의 KRX 정규장 종가 기준일이 다릅니다.");
    }
    return result.changes > 0;
  } finally { db.close(); }
}

export async function recordMarketLiveArchive({
  now = Date.now(), file = marketLiveArchivePath, collect = loadMarketLiveBoard,
}: { now?: number; file?: string; collect?: () => Promise<MarketLiveBoardData> } = {}): Promise<ArchiveResult> {
  const expected = resolveMarketLiveSession(now);
  if (expected.state !== "open" && expected.state !== "auction") return { status: "skipped" };
  const { date, baselineDate } = expected;
  if (!baselineDate) return { status: "missing", date, reason: "직전 KRX 정규장 종가 기준일 미확인" };

  const board = await collect();
  const observed = Date.parse(board.collectedAt);
  if (!Number.isFinite(observed) || observed < expected.openAt || observed >= expected.closeAt || localDate(observed) !== date ||
      board.date !== date || board.baselineDate !== baselineDate || (board.state !== "open" && board.state !== "auction")) {
    return { status: "missing", date, reason: "유효한 KRX 정규장 시각 또는 비교 기준일 불일치" };
  }
  const auctionAt = expected.auctionAt ?? Infinity;
  const inAuction = observed >= auctionAt;
  const earliest = Math.max(expected.openAt, observed - MARKET_LIVE_STALE_MS, inAuction ? auctionAt : 0);
  const frame = archiveFrame(board, observed, earliest);
  if (!frame) return { status: "missing", date, reason: "유효한 KRX 장중 체결가와 비교 종가 없음" };
  const saved = saveArchiveFrame(file, date, baselineDate, inAuction ? "auction" : "open", frame);
  return { status: saved ? "recorded" : "exists", date, collectedAt: frame.collectedAt, stocks: frame.stocks.length };
}
