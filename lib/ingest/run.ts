import { taiwanCompanies } from "@/config/taiwan";
import { activeInstruments, type InstrumentConfig } from "@/config/universe";
import type { AppDatabase } from "@/lib/db/client";
import { applyQuote, recordIngest, syncInstruments, upsertDailyBars } from "@/lib/db/quotes";
import { seoulToday } from "@/lib/format";
import { replaceEtfHoldings } from "@/lib/db/etf";
import { upsertFlows } from "@/lib/db/flow";
import { upsertMonthly } from "@/lib/db/monthly";
import { replaceNaverRanks, upsertNaverBreadth, upsertNaverIndex } from "@/lib/db/naver";
import { fetchMarketBreadthHistory, fetchQuoteBreadth } from "@/lib/sources/breadth-history";
import { fetchDartList } from "@/lib/sources/dart";
import { fetchNaverEtf } from "@/lib/sources/etf";
import { fetchTrendDeposits, type FlowPoint } from "@/lib/sources/flow";
import { fetchHyperliquid } from "@/lib/sources/hyperliquid";
import { fetchNaverBoard } from "@/lib/sources/naver";
import { fetchTaiwanRevenue } from "@/lib/sources/taiwan";
import { fetchYahooEtfFacts, fetchYahooHistory, fetchYahooQuotes } from "@/lib/sources/yahoo";

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
  reports.push(await ingestNaver(db));
  reports.push(await ingestFlow(db));
  reports.push(await ingestEtf(db, now));
  reports.push(await ingestBreadthHistory(db, now));
  reports.push(await ingestTaiwan(db));
  return reports;
}

async function ingestNaver(db: AppDatabase): Promise<JobReport> {
  const started = stamp();
  const result = await fetchNaverBoard();
  if (result.status !== "ok") return logRun(db, "naver", started, result.status, result.message);
  const asOf = stamp();
  for (const market of result.data.ranks) replaceNaverRanks(db, market.market, market.rows, asOf);
  for (const index of result.data.indexes) upsertNaverIndex(db, index, asOf);
  for (const row of result.data.breadth) upsertNaverBreadth(db, row);
  const trading = new Map<string, FlowPoint>();
  for (const item of result.data.trading) {
    const current = trading.get(item.date) ?? { date: item.date, deposits: null, credit: null, creditPct: null, kospi: null, kosdaq: null };
    if (item.market === "KOSPI") current.kospi = item.valueEok;
    else current.kosdaq = item.valueEok;
    trading.set(item.date, current);
  }
  if (trading.size) upsertFlows(db, [...trading.values()]);
  const counts = result.data.ranks.map((item) => `${item.market} ${item.rows.length}`).join(", ");
  const missing = result.data.ranks.length < 2 ? " 일부 시장은 이전 순위를 유지합니다." : "";
  const breadthNote = result.data.breadth.length < 2 ? " 등락이 비면 이전 종목 수를 유지합니다." : "";
  const breadth = result.data.breadth.map((row) => `${row.market} ${row.advancers}/${row.decliners}/${row.unchanged}`).join(", ");
  const value = result.data.trading.map((row) => `${row.market} ${Math.round(row.valueEok)}억`).join(", ");
  return logRun(db, "naver", started, "ok", `${counts || "순위 없음"}, 지수 ${result.data.indexes.length}, 등락 ${breadth || "없음"}, 거래대금 ${value || "없음"}.${missing}${breadthNote}`);
}

async function ingestBreadthHistory(db: AppDatabase, now: Date): Promise<JobReport> {
  const started = stamp();
  const digest = await fetchMarketBreadthHistory("2026-09-15", seoulToday(now));
  const stored = new Set(
    (db.prepare("SELECT date FROM breadth_daily WHERE market = 'KOSPI'").all() as { date: string }[])
      .map((row) => row.date.replaceAll("-", "")),
  );
  const quotes = await fetchQuoteBreadth(stored);
  if (digest.status !== "ok" && quotes.status !== "ok") {
    return logRun(db, "breadth", started, "stale", `${digest.message} ${quotes.message}`);
  }
  if (digest.status === "ok") for (const row of digest.data) upsertNaverBreadth(db, row);
  if (quotes.status === "ok") for (const row of quotes.data) upsertNaverBreadth(db, row);
  const allLatest = digest.status === "ok" ? digest.data.at(-1) : undefined;
  const quoteDays = quotes.status === "ok" ? new Set(quotes.data.map((row) => row.date)).size : 0;
  const allNote = allLatest ? `전 시장 ${digest.status === "ok" ? digest.data.length : 0}거래일, 최근 ${allLatest.date}` : "전 시장 유지";
  const quoteNote = quotes.status === "ok" ? `KOSPI·KOSDAQ 시세 ${quoteDays}거래일` : "KOSPI·KOSDAQ 시세 유지";
  return logRun(db, "breadth", started, "ok", `${allNote}. ${quoteNote}.`);
}

async function ingestTaiwan(db: AppDatabase): Promise<JobReport> {
  const started = stamp();
  const result = await fetchTaiwanRevenue(taiwanCompanies);
  if (result.status !== "ok") return logRun(db, "taiwan", started, result.status, result.message);
  upsertMonthly(db, "taiwan", result.data.map((row) => ({
    key: row.symbol,
    period: row.period,
    value: row.revenue,
    unit: "TWD_thousands",
    label: row.name,
    extra: JSON.stringify({ sector: row.sector }),
  })));
  const found = new Set(result.data.map((row) => row.symbol));
  const missing = taiwanCompanies.filter((company) => !found.has(company.symbol)).map((company) => company.symbol);
  const latest = result.data.map((row) => row.period).sort().at(-1) ?? "없음";
  const note = missing.length ? ` 목록에 없음: ${missing.join(", ")}.` : "";
  return logRun(db, "taiwan", started, "ok", `상장 ${found.size}종, 최근 ${latest}, 금액은 천 대만달러.${note}`);
}

async function ingestFlow(db: AppDatabase): Promise<JobReport> {
  const started = stamp();
  const stored = db.prepare("SELECT COUNT(*) AS n FROM flow_daily WHERE deposits IS NOT NULL").get() as { n: number };
  const pages = stored.n >= 1200 ? 1 : 13;
  const result = await fetchTrendDeposits(pages);
  if (result.status !== "ok") return logRun(db, "flow", started, result.status, result.message);
  upsertFlows(db, result.data);
  const latest = result.data.map((row) => row.date).sort().at(-1) ?? "없음";
  return logRun(db, "flow", started, "ok", `예탁·신용 ${result.data.length}일, 최근 ${latest}`);
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
  if (shares == null && nav == null && aum == null) return;
  db.prepare(`
    INSERT INTO etf_daily (instrument_id, date, shares_outstanding, nav, aum)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(instrument_id, date) DO UPDATE SET
      shares_outstanding = COALESCE(excluded.shares_outstanding, etf_daily.shares_outstanding),
      nav = COALESCE(excluded.nav, etf_daily.nav),
      aum = COALESCE(excluded.aum, etf_daily.aum)
  `).run(item.id, date, shares, nav, aum);
}

async function ingestEtf(db: AppDatabase, now: Date): Promise<JobReport> {
  const started = stamp();
  const date = seoulToday(now);
  const notes: string[] = [];
  let saved = 0;
  for (const item of activeInstruments().filter((entry) => entry.kind === "etf")) {
    const korean = item.symbol.match(/^(\d{6})\.(KS|KQ)$/);
    const result = korean ? await fetchNaverEtf(korean[1]) : await fetchYahooEtfFacts(item.symbol);
    if (result.status !== "ok") {
      notes.push(`${item.id} ${result.message}`);
      continue;
    }
    rememberEtf(db, item, result.data.shares, result.data.nav, result.data.aum, date);
    if (result.data.holdings.length) replaceEtfHoldings(db, item.id, date, result.data.holdings);
    saved += 1;
    notes.push(`${item.id} ${result.data.nav == null ? "NAV 없음" : "NAV 있음"}, 구성 ${result.data.holdings.length}`);
  }
  if (!saved) return logRun(db, "etf", started, "stale", notes.join("; ") || "ETF 수집 실패");
  return logRun(db, "etf", started, "ok", notes.join("; "));
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
