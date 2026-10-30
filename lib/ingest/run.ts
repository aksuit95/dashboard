import { activeInstruments, type InstrumentConfig } from "@/config/universe";
import type { AppDatabase } from "@/lib/db/client";
import { applyQuote, recordIngest, syncInstruments, upsertDailyBars } from "@/lib/db/quotes";
import { seoulToday } from "@/lib/format";
import { fetchDartList } from "@/lib/sources/dart";
import { fetchHyperliquid } from "@/lib/sources/hyperliquid";
import { fetchYahooHistory, fetchYahooQuotes } from "@/lib/sources/yahoo";

export type JobReport = {
  source: string;
  status: string;
  message: string;
};

function stamp(): string {
  return new Date().toISOString();
}

function logRun(db: AppDatabase, source: string, startedAt: string, status: string, message: string): JobReport {
  const finishedAt = stamp();
  recordIngest(db, { source, startedAt, finishedAt, status, message });
  return { source, status, message };
}

export async function ingestQuotes(db: AppDatabase, now = new Date()): Promise<JobReport[]> {
  const items = activeInstruments();
  syncInstruments(db, items);
  const reports: JobReport[] = [];
  const yahoo = items.filter((item) => item.source === "yahoo");
  const hyper = items.filter((item) => item.source === "hyperliquid");
  const started = stamp();
  const yahooResult = await fetchYahooQuotes(
    yahoo.map((item) => item.symbol),
    new Set(yahoo.filter((item) => item.session === "always").map((item) => item.symbol)),
  );
  if (yahooResult.status !== "ok") {
    for (const item of yahoo) applyQuote(db, item.id, yahooResult, stamp());
    reports.push(logRun(db, "yahoo", started, yahooResult.status, yahooResult.message));
  } else {
    const missing: string[] = [];
    for (const item of yahoo) {
      const quote = yahooResult.data.get(item.symbol);
      if (!quote) {
        missing.push(item.symbol);
        applyQuote(db, item.id, { status: "empty", message: "응답에 심볼이 없습니다." }, stamp());
        continue;
      }
      applyQuote(db, item.id, { status: "ok", data: quote }, stamp());
      rememberEtf(db, item, quote.sharesOutstanding, quote.nav, quote.marketCap, seoulToday(now));
    }
    const message = missing.length ? `누락: ${missing.join(", ")}` : `${yahooResult.data.size}개 시세`;
    reports.push(logRun(db, "yahoo", started, missing.length ? "empty" : "ok", message));
  }

  const hyperStarted = stamp();
  const hyperResult = await fetchHyperliquid(hyper.map((item) => item.symbol));
  if (hyperResult.status !== "ok") {
    for (const item of hyper) applyQuote(db, item.id, hyperResult, stamp());
    reports.push(logRun(db, "hyperliquid", hyperStarted, hyperResult.status, hyperResult.message));
  } else {
    const missing: string[] = [];
    for (const item of hyper) {
      const quote = hyperResult.data.get(item.symbol);
      if (!quote) {
        missing.push(item.symbol);
        applyQuote(db, item.id, { status: "empty", message: "상장 목록에 없습니다." }, stamp());
        continue;
      }
      applyQuote(db, item.id, { status: "ok", data: quote }, stamp());
    }
    const message = missing.length ? `누락: ${missing.join(", ")}` : `${hyperResult.data.size}개 퍼프`;
    reports.push(logRun(db, "hyperliquid", hyperStarted, missing.length ? "empty" : "ok", message));
  }

  snapshotToday(db, seoulToday(now));
  reports.push(await ingestDart(db, now));
  return reports;
}

function rememberEtf(
  db: AppDatabase,
  item: InstrumentConfig,
  shares: number | null,
  nav: number | null,
  aum: number | null,
  date: string,
): void {
  if (item.kind !== "etf") return;
  db.prepare(`
    INSERT INTO etf_daily (instrument_id, date, shares_outstanding, nav, aum)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(instrument_id, date) DO UPDATE SET
      shares_outstanding = excluded.shares_outstanding,
      nav = excluded.nav,
      aum = excluded.aum
  `).run(item.id, date, shares, nav, aum);
}

export function snapshotToday(db: AppDatabase, date: string): void {
  const rows = db.prepare(`
    SELECT q.instrument_id, q.price, i.shares_outstanding, i.market_cap, i.history
    FROM quotes q JOIN instruments i ON i.id = q.instrument_id
    WHERE i.history = 1 AND q.stale = 0
  `).all() as { instrument_id: string; price: number; shares_outstanding: number | null; market_cap: number | null }[];
  const statement = db.prepare(`
    INSERT INTO daily_bars (instrument_id, date, close, market_cap, market_cap_basis)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(instrument_id, date) DO UPDATE SET
      close = excluded.close,
      market_cap = COALESCE(excluded.market_cap, daily_bars.market_cap),
      market_cap_basis = COALESCE(excluded.market_cap_basis, daily_bars.market_cap_basis)
  `);
  for (const row of rows) {
    const cap = row.market_cap ?? (row.shares_outstanding != null ? row.price * row.shares_outstanding : null);
    const basis = row.market_cap != null ? "vendor" : cap != null ? "price_times_shares" : null;
    statement.run(row.instrument_id, date, row.price, cap, basis);
  }
}

export async function backfillHistory(db: AppDatabase, range = "5y"): Promise<JobReport[]> {
  syncInstruments(db, activeInstruments());
  const targets = activeInstruments().filter((item) => item.history && item.source === "yahoo");
  const reports: JobReport[] = [];
  for (const item of targets) {
    const started = stamp();
    const result = await fetchYahooHistory(item.symbol, range);
    if (result.status !== "ok") {
      reports.push(logRun(db, `backfill:${item.id}`, started, result.status, result.message));
      continue;
    }
    upsertDailyBars(db, item.id, result.data, "price_times_shares");
    reports.push(logRun(db, `backfill:${item.id}`, started, "ok", `${result.data.length}일`));
  }
  return reports;
}

export async function ingestDart(db: AppDatabase, now = new Date()): Promise<JobReport> {
  const started = stamp();
  const caps = new Map<string, number>();
  const rows = db.prepare(`
    SELECT id, market_cap, market_cap_currency, currency FROM instruments WHERE market_cap IS NOT NULL
  `).all() as { id: string; market_cap: number; market_cap_currency: string | null; currency: string }[];
  for (const row of rows) {
    const code = row.id.replace(/\.(KS|KQ)$/, "");
    if (!/^\d{6}$/.test(code)) continue;
    const currency = row.market_cap_currency || row.currency;
    if (currency === "KRW") caps.set(code, row.market_cap);
  }
  const result = await fetchDartList({ apiKey: process.env.DART_API_KEY, capsByCode: caps, now });
  if (result.status !== "ok") return logRun(db, "dart", started, result.status, result.message);
  const statement = db.prepare(`
    INSERT INTO filings (
      rcept_no, stock_code, corp_name, report_name, category, rcept_dt, url, parse_status, parsed_json, market_cap_krw, cap_filter
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(rcept_no) DO UPDATE SET
      category = excluded.category,
      market_cap_krw = excluded.market_cap_krw,
      cap_filter = excluded.cap_filter
  `);
  let kept = 0;
  for (const filing of result.data) {
    if (filing.capFilter === "exclude") continue;
    kept += 1;
    statement.run(
      filing.rceptNo,
      filing.stockCode,
      filing.corpName,
      filing.reportName,
      filing.category,
      filing.rceptDt,
      filing.url,
      filing.parseStatus,
      filing.marketCapKrw,
      filing.capFilter,
    );
  }
  return logRun(db, "dart", started, "ok", `수신 ${result.data.length}건, 표시 ${kept}건`);
}
