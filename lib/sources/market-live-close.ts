import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hasMarketLiveClosingBasis, marketLiveTradingWindow } from "@/lib/market/market-live-session";
import type { MarketLiveClosingSnapshot } from "@/lib/market/market-live";

export const marketLiveArchivePath = path.join(process.cwd(), "data", "market-live-archive.sqlite");
const table = "market_live_close_v1";

export function withinClosingCapture(now: number, closeAt: number) {
  // KRX post-close trading starts no earlier than ten minutes after the regular close.
  return now >= closeAt && now < closeAt + 9 * 60_000;
}

export function validMarketLiveClose(value: MarketLiveClosingSnapshot | undefined, date: string, baselineDate: string | null) {
  const window = marketLiveTradingWindow(date);
  if (!value || value.date !== date || value.baselineDate !== baselineDate || value.basis !== "KRX_REGULAR_CLOSE" ||
      !window || !hasMarketLiveClosingBasis(date, window.closeAt) || !withinClosingCapture(Date.parse(value.collectedAt), window.closeAt) ||
      !Array.isArray(value.stocks) || !value.stocks.length) return null;
  if (new Set(value.stocks.map(stock => stock?.code)).size !== value.stocks.length ||
      value.stocks.some(stock => !stock || !/^[0-9A-Z]{6}$/.test(stock.code) || !Number.isSafeInteger(stock.price) || stock.price <= 0 ||
        !Number.isSafeInteger(stock.turnover) || stock.turnover < 0 ||
        (stock.baselineClose !== undefined && (!Number.isSafeInteger(stock.baselineClose) || stock.baselineClose <= 0)) ||
        (stock.marketCap !== undefined && (!Number.isSafeInteger(stock.marketCap) || stock.marketCap <= 0)))) return null;
  return value;
}

export function readMarketLiveClose(date: string, file = marketLiveArchivePath): MarketLiveClosingSnapshot | undefined {
  if (!existsSync(file)) return undefined;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)) return undefined;
    const row = db.prepare(`SELECT snapshot FROM ${table} WHERE trade_date = ?`).get(date);
    return row ? JSON.parse(String(row.snapshot)) : undefined;
  } finally { db.close(); }
}

export function saveMarketLiveClose(snapshot: MarketLiveClosingSnapshot, file = marketLiveArchivePath) {
  if (!validMarketLiveClose(snapshot, snapshot.date, snapshot.baselineDate)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec(`PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS ${table} (trade_date TEXT PRIMARY KEY, snapshot TEXT NOT NULL)`);
    db.prepare(`INSERT OR IGNORE INTO ${table} (trade_date, snapshot) VALUES (?, ?)`).run(snapshot.date, JSON.stringify(snapshot));
  } finally { db.close(); }
}
