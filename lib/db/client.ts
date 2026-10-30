import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS instruments (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  source TEXT NOT NULL,
  currency TEXT NOT NULL,
  kind TEXT NOT NULL,
  instrument_class TEXT NOT NULL,
  shares_per_receipt REAL NOT NULL,
  session_kind TEXT NOT NULL,
  group_name TEXT NOT NULL,
  active INTEGER NOT NULL,
  history INTEGER NOT NULL,
  base_id TEXT,
  mover_market TEXT,
  note TEXT,
  shares_outstanding REAL,
  market_cap REAL,
  market_cap_currency TEXT
);

CREATE TABLE IF NOT EXISTS quotes (
  instrument_id TEXT PRIMARY KEY,
  price REAL NOT NULL,
  previous_close REAL,
  session TEXT NOT NULL,
  as_of TEXT,
  fetched_at TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  funding_hourly REAL,
  FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS daily_bars (
  instrument_id TEXT NOT NULL,
  date TEXT NOT NULL,
  close REAL NOT NULL,
  market_cap REAL,
  market_cap_basis TEXT,
  PRIMARY KEY (instrument_id, date),
  FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

CREATE TABLE IF NOT EXISTS breadth_daily (
  market TEXT NOT NULL,
  date TEXT NOT NULL,
  advancers INTEGER NOT NULL,
  decliners INTEGER NOT NULL,
  unchanged INTEGER NOT NULL,
  PRIMARY KEY (market, date)
);

CREATE TABLE IF NOT EXISTS filings (
  rcept_no TEXT PRIMARY KEY,
  stock_code TEXT NOT NULL,
  corp_name TEXT NOT NULL,
  report_name TEXT NOT NULL,
  category TEXT NOT NULL,
  rcept_dt TEXT NOT NULL,
  url TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  parsed_json TEXT,
  market_cap_krw REAL,
  cap_filter TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS etf_daily (
  instrument_id TEXT NOT NULL,
  date TEXT NOT NULL,
  shares_outstanding REAL,
  nav REAL,
  aum REAL,
  PRIMARY KEY (instrument_id, date),
  FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

CREATE TABLE IF NOT EXISTS etf_holdings (
  etf_symbol TEXT NOT NULL,
  as_of TEXT NOT NULL,
  constituent_symbol TEXT NOT NULL,
  constituent_name TEXT NOT NULL,
  weight REAL NOT NULL,
  PRIMARY KEY (etf_symbol, as_of, constituent_symbol)
);

CREATE TABLE IF NOT EXISTS flow_daily (
  date TEXT PRIMARY KEY,
  deposits REAL,
  credit_balance REAL,
  credit_mcap_pct REAL,
  kospi_value REAL,
  kosdaq_value REAL
);

CREATE TABLE IF NOT EXISTS monthly_series (
  source TEXT NOT NULL,
  series_key TEXT NOT NULL,
  period TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  label TEXT NOT NULL,
  extra_json TEXT,
  PRIMARY KEY (source, series_key, period)
);

CREATE TABLE IF NOT EXISTS concalls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  held_at TEXT NOT NULL,
  period TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS overseas_trades (
  window TEXT NOT NULL,
  as_of TEXT NOT NULL,
  rank INTEGER NOT NULL,
  name TEXT NOT NULL,
  buy REAL NOT NULL,
  sell REAL NOT NULL,
  net REAL NOT NULL,
  PRIMARY KEY (window, as_of, rank)
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  as_of TEXT,
  created_at TEXT NOT NULL,
  row_count INTEGER NOT NULL
);
`;

export type AppDatabase = DatabaseSync;

export function databasePath(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured === ":memory:") return ":memory:";
  if (!configured) return path.join(process.cwd(), "data", "market.sqlite");
  const file = configured.startsWith("file:") ? configured.slice("file:".length) : configured;
  return path.isAbsolute(file) ? file : path.join(process.cwd(), file);
}

export function openDatabase(file = databasePath()): AppDatabase {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

let cached: AppDatabase | null = null;

export function getDb(): AppDatabase {
  if (!cached) cached = openDatabase();
  return cached;
}

export function closeCachedDb(): void {
  cached?.close();
  cached = null;
}
