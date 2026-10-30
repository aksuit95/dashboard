import type { InstrumentConfig } from "@/config/universe";
import type { AppDatabase } from "@/lib/db/client";
import type { DailyBarPayload, QuotePayload, SourceResult } from "@/lib/sources/types";

export type StoredQuote = QuotePayload & {
  instrumentId: string;
  fetchedAt: string;
  stale: boolean;
};

export function syncInstruments(db: AppDatabase, items: InstrumentConfig[]): void {
  const statement = db.prepare(`
    INSERT INTO instruments (
      id, symbol, name, venue, source, currency, kind, instrument_class,
      shares_per_receipt, session_kind, group_name, active, history, base_id, mover_market, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      symbol = excluded.symbol,
      name = excluded.name,
      venue = excluded.venue,
      source = excluded.source,
      currency = excluded.currency,
      kind = excluded.kind,
      instrument_class = excluded.instrument_class,
      shares_per_receipt = excluded.shares_per_receipt,
      session_kind = excluded.session_kind,
      group_name = excluded.group_name,
      active = excluded.active,
      history = excluded.history,
      base_id = excluded.base_id,
      mover_market = excluded.mover_market,
      note = excluded.note
  `);
  for (const item of items) {
    statement.run(
      item.id,
      item.symbol,
      item.name,
      item.venue,
      item.source,
      item.currency,
      item.kind,
      item.instrumentClass,
      item.sharesPerReceipt,
      item.session,
      item.group,
      item.active ? 1 : 0,
      item.history ? 1 : 0,
      item.baseId ?? null,
      item.moverMarket ?? null,
      item.note ?? null,
    );
  }
}

export function applyQuote(
  db: AppDatabase,
  instrumentId: string,
  result: SourceResult<QuotePayload>,
  fetchedAt: string,
): void {
  if (result.status !== "ok") {
    const existing = db.prepare("SELECT instrument_id FROM quotes WHERE instrument_id = ?").get(instrumentId) as
      | { instrument_id: string }
      | undefined;
    if (existing) {
      db.prepare("UPDATE quotes SET stale = 1 WHERE instrument_id = ?").run(instrumentId);
    }
    return;
  }
  const quote = result.data;
  db.prepare(`
    INSERT INTO quotes (
      instrument_id, price, previous_close, session, as_of, fetched_at, stale, funding_hourly
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(instrument_id) DO UPDATE SET
      price = excluded.price,
      previous_close = excluded.previous_close,
      session = excluded.session,
      as_of = excluded.as_of,
      fetched_at = excluded.fetched_at,
      stale = 0,
      funding_hourly = excluded.funding_hourly
  `).run(
    instrumentId,
    quote.price,
    quote.previousClose,
    quote.session,
    quote.asOf,
    fetchedAt,
    quote.fundingHourly,
  );
  if (quote.sharesOutstanding != null || quote.marketCap != null) {
    db.prepare(`
      UPDATE instruments
      SET shares_outstanding = COALESCE(?, shares_outstanding),
          market_cap = COALESCE(?, market_cap),
          market_cap_currency = COALESCE(?, market_cap_currency)
      WHERE id = ?
    `).run(quote.sharesOutstanding, quote.marketCap, quote.marketCapCurrency, instrumentId);
  }
}

export function recordIngest(
  db: AppDatabase,
  input: { source: string; startedAt: string; finishedAt: string; status: string; message: string },
): void {
  db.prepare(`
    INSERT INTO ingest_runs (source, started_at, finished_at, status, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.source, input.startedAt, input.finishedAt, input.status, input.message);
}

export function readQuote(db: AppDatabase, instrumentId: string): StoredQuote | null {
  const row = db.prepare(`
    SELECT instrument_id, price, previous_close, session, as_of, fetched_at, stale, funding_hourly
    FROM quotes WHERE instrument_id = ?
  `).get(instrumentId) as
    | {
        instrument_id: string;
        price: number;
        previous_close: number | null;
        session: "live" | "closed" | "unknown";
        as_of: string | null;
        fetched_at: string;
        stale: number;
        funding_hourly: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    instrumentId: row.instrument_id,
    price: row.price,
    previousClose: row.previous_close,
    session: row.session,
    asOf: row.as_of,
    fetchedAt: row.fetched_at,
    stale: row.stale === 1,
    fundingHourly: row.funding_hourly,
    sharesOutstanding: null,
    marketCap: null,
    marketCapCurrency: null,
    nav: null,
  };
}

export function upsertDailyBars(db: AppDatabase, instrumentId: string, bars: DailyBarPayload[], basis: string | null): void {
  const statement = db.prepare(`
    INSERT INTO daily_bars (instrument_id, date, close, market_cap, market_cap_basis)
    VALUES (?, ?, ?, NULL, NULL)
    ON CONFLICT(instrument_id, date) DO UPDATE SET close = excluded.close
  `);
  for (const bar of bars) {
    statement.run(instrumentId, bar.date, bar.close);
  }
  if (!basis) return;
  const instrument = db.prepare("SELECT shares_outstanding, currency FROM instruments WHERE id = ?").get(instrumentId) as
    | { shares_outstanding: number | null; currency: string }
    | undefined;
  if (!instrument?.shares_outstanding) return;
  db.prepare(`
    UPDATE daily_bars
    SET market_cap = close * ?, market_cap_basis = ?
    WHERE instrument_id = ? AND market_cap IS NULL
  `).run(instrument.shares_outstanding, basis, instrumentId);
}

export function listDailyBars(db: AppDatabase, instrumentId: string): { date: string; close: number; marketCap: number | null }[] {
  const rows = db.prepare(`
    SELECT date, close, market_cap FROM daily_bars WHERE instrument_id = ? ORDER BY date
  `).all(instrumentId) as { date: string; close: number; market_cap: number | null }[];
  return rows.map((row) => ({ date: row.date, close: row.close, marketCap: row.market_cap }));
}

export type IngestRunRow = {
  id: number;
  source: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  message: string;
};

export function listIngestRuns(db: AppDatabase, limit = 30): IngestRunRow[] {
  const rows = db.prepare(`
    SELECT id, source, started_at, finished_at, status, message
    FROM ingest_runs ORDER BY id DESC LIMIT ?
  `).all(limit) as {
    id: number;
    source: string;
    started_at: string;
    finished_at: string;
    status: string;
    message: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    message: row.message,
  }));
}
