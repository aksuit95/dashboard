import {
  activeInstruments,
  annualReturnIds,
  boardSections,
  disparityIds,
  etfGroups,
  fxIds,
  instrumentById,
  krxReferenceIds,
  mcapPairs,
  type InstrumentConfig,
} from "@/config/universe";
import type { AppDatabase } from "@/lib/db/client";
import { listDailyBars, listIngestRuns, readQuote, type IngestRunRow } from "@/lib/db/quotes";
import { formatNumber, formatPrice, formatSigned, formatWhen, formatCompact } from "@/lib/format";
import {
  changePercent,
  funding8hPercent,
  fxForCurrency,
  perShareKrw,
  premiumPercent,
  toUsd,
  type FxRates,
} from "@/lib/market/convert";
import { fiftyTwoWeekHigh, moverExclusion, trailingReturn } from "@/lib/market/movers";
import {
  adrRatio,
  annualPriceReturns,
  disparity,
  disparitySeries,
  etfNetFlow,
  holdingWeightChanges,
  marketCapRatio,
  revenueYoy,
  type AnnualReturn,
} from "@/lib/market/series";

export type CardModel = {
  id: string;
  name: string;
  symbol: string;
  venue: string;
  session: "live" | "closed" | "unknown" | "missing";
  primary: string;
  changeText: string;
  changePct: number | null;
  lines: string[];
  stale: boolean;
  asOf: string | null;
};

export type BoardSection = {
  id: string;
  title: string;
  description: string;
  cards: CardModel[];
};

type InstrumentRow = {
  id: string;
  name: string;
  symbol: string;
  currency: string;
  instrument_class: string;
  mover_market: string | null;
  market_cap: number | null;
  market_cap_currency: string | null;
  kind: string;
};

function fxFrom(db: AppDatabase): { fx: FxRates; asOf: string | null } {
  const usd = readQuote(db, fxIds.usdkrw);
  const eur = readQuote(db, fxIds.eurkrw);
  const jpy = readQuote(db, fxIds.usdjpy);
  return {
    fx: { usdkrw: usd?.price ?? null, eurkrw: eur?.price ?? null, usdjpy: jpy?.price ?? null },
    asOf: usd?.asOf ?? usd?.fetchedAt ?? null,
  };
}

function cardFor(db: AppDatabase, item: InstrumentConfig, fx: FxRates, fxAsOf: string | null): CardModel {
  const quote = readQuote(db, item.id);
  if (!quote) {
    return {
      id: item.id,
      name: item.name,
      symbol: item.symbol,
      venue: item.venue,
      session: "missing",
      primary: "데이터 없음",
      changeText: "수집 전",
      changePct: null,
      lines: item.note ? [item.note] : [],
      stale: false,
      asOf: null,
    };
  }

  const lines: string[] = [];
  if (item.note) lines.push(item.note);
  const changePct = changePercent(quote.price, quote.previousClose);
  let primary = formatPrice(quote.price, item.currency);
  const comparable = item.baseId ? instrumentById(item.baseId) : undefined;
  const base = item.baseId ? readQuote(db, item.baseId) : null;

  if (comparable && (item.currency === "USD" || item.currency === "EUR" || item.currency === "JPY")) {
    const rate = fxForCurrency(item.currency, fx);
    const perShare = rate == null ? null : perShareKrw(quote.price, rate, item.sharesPerReceipt);
    if (perShare == null) {
      lines.push("환율이 없어 원화 환산을 건너뛰었습니다.");
    } else {
      primary = formatPrice(perShare, "KRW");
      const premium = premiumPercent(perShare, base?.price ?? null);
      if (premium != null && base) {
        lines.push(`vs ${comparable.name} ${formatPrice(base.price, comparable.currency)} ${formatSigned(premium)}%`);
      } else {
        lines.push("기준 시세 없음");
      }
      if (fxAsOf) lines.push(`환율 ${formatWhen(fxAsOf)}`);
    }
  } else if (item.currency === "POINTS" && base && comparable?.currency === "POINTS") {
    const premium = premiumPercent(quote.price, base.price);
    if (premium != null) lines.push(`vs ${comparable.name} ${formatSigned(premium)}%`);
  }

  const funding = funding8hPercent(quote.fundingHourly);
  if (funding != null) lines.push(`펀딩 ${formatSigned(funding, 3)}% / 8시간`);
  if (quote.stale) lines.push(`마지막 성공 ${formatWhen(quote.fetchedAt)}`);

  return {
    id: item.id,
    name: item.name,
    symbol: item.symbol,
    venue: item.venue,
    session: quote.session,
    primary,
    changeText: changePct == null ? "대비 없음" : `${formatSigned(changePct)}%`,
    changePct,
    lines,
    stale: quote.stale,
    asOf: quote.asOf ?? quote.fetchedAt,
  };
}

const hiddenMacro = new Set(["EURKRW=X", "JPY=X", "2YY=F"]);

export function loadBoard(db: AppDatabase): { sections: BoardSection[]; references: CardModel[] } {
  const { fx, asOf } = fxFrom(db);
  const visible = activeInstruments();
  const sections = boardSections.map((section) => ({
    ...section,
    cards: visible
      .filter((item) => item.group === section.id && !hiddenMacro.has(item.id))
      .map((item) => cardFor(db, item, fx, asOf)),
  }));
  const references = krxReferenceIds
    .map((id) => instrumentById(id))
    .filter((item): item is InstrumentConfig => Boolean(item))
    .map((item) => cardFor(db, item, fx, asOf));
  return { sections, references };
}

export function loadAdr(db: AppDatabase): {
  markets: { market: string; ratio: number | null; previous: number | null; up: number; down: number; flat: number; series: { date: string; value: number }[] }[];
} {
  const markets = [
    { code: "ALL", label: "전 시장" },
    { code: "KOSPI", label: "KOSPI" },
    { code: "KOSDAQ", label: "KOSDAQ" },
  ].map(({ code, label }) => {
    const rows = db.prepare(`
      SELECT date, advancers, decliners, unchanged FROM breadth_daily WHERE market = ? ORDER BY date
    `).all(code) as { date: string; advancers: number; decliners: number; unchanged: number }[];
    const series = rows
      .map((row, index) => {
        const value = adrRatio(rows.slice(0, index + 1));
        return value == null ? null : { date: row.date, value };
      })
      .filter((point): point is { date: string; value: number } => point != null);
    const latest = rows.at(-1);
    const ratio = adrRatio(rows);
    const previous = rows.length > 1 ? adrRatio(rows.slice(0, -1)) : null;
    return {
      market: label,
      ratio,
      previous: ratio != null && previous != null ? ratio - previous : null,
      up: latest?.advancers ?? 0,
      down: latest?.decliners ?? 0,
      flat: latest?.unchanged ?? 0,
      series,
    };
  });
  return { markets };
}

export function loadRisk(db: AppDatabase): {
  disparity: { id: string; name: string; latest25: number | null; latest50: number | null; series25: { date: string; value: number }[]; series50: { date: string; value: number }[] }[];
  vix: CardModel | null;
  sox: CardModel | null;
  spread: { value: number | null; ten: number | null; two: number | null; note: string } | null;
} {
  const { fx, asOf } = fxFrom(db);
  const disparityRows = disparityIds.map((id) => {
    const item = instrumentById(id);
    const bars = listDailyBars(db, id);
    const closes = bars.map((bar) => bar.close);
    return {
      id,
      name: item?.name ?? id,
      latest25: disparity(closes, 25),
      latest50: disparity(closes, 50),
      series25: disparitySeries(bars, 25),
      series50: disparitySeries(bars, 50),
    };
  });
  const vixItem = instrumentById("^VIX");
  const soxItem = instrumentById("^SOX");
  const ten = readQuote(db, "^TNX");
  const two = readQuote(db, "2YY=F");
  return {
    disparity: disparityRows,
    vix: vixItem ? cardFor(db, vixItem, fx, asOf) : null,
    sox: soxItem ? cardFor(db, soxItem, fx, asOf) : null,
    spread: {
      value: ten && two ? ten.price - two.price : null,
      ten: ten?.price ?? null,
      two: two?.price ?? null,
      note: "10년물(^TNX) − 2년 금리 선물(2YY=F). 현물 2년물과 다를 수 있습니다.",
    },
  };
}

export function loadAnnual(db: AppDatabase): { id: string; name: string; rows: AnnualReturn[] }[] {
  return annualReturnIds.map((id) => ({
    id,
    name: instrumentById(id)?.name ?? id,
    rows: annualPriceReturns(listDailyBars(db, id)),
  }));
}

export type EtfCard = {
  id: string;
  name: string;
  symbol: string;
  asOf: string | null;
  flow: number | null;
  shares: number | null;
  aum: number | null;
  nav: number | null;
  currency: string;
  stale: boolean;
};

export function loadEtfFlows(db: AppDatabase): { id: string; name: string; cards: EtfCard[] }[] {
  return etfGroups.map((group) => ({
    id: group.id,
    name: group.name,
    cards: group.instrumentIds.map((id) => {
      const item = instrumentById(id);
      const rows = db.prepare(`
        SELECT date, shares_outstanding, nav, aum FROM etf_daily WHERE instrument_id = ? ORDER BY date
      `).all(id) as { date: string; shares_outstanding: number | null; nav: number | null; aum: number | null }[];
      const latest = rows.at(-1);
      const previous = rows.length > 1 ? rows[rows.length - 2] : null;
      return {
        id,
        name: item?.name ?? id,
        symbol: item?.symbol ?? id,
        asOf: latest?.date ?? null,
        flow: etfNetFlow(previous?.shares_outstanding ?? null, latest?.shares_outstanding ?? null, latest?.nav ?? null),
        shares: latest?.shares_outstanding ?? null,
        aum: latest?.aum ?? null,
        nav: latest?.nav ?? null,
        currency: item?.currency ?? "USD",
        stale: false,
      };
    }),
  }));
}

export function loadHoldings(db: AppDatabase): {
  groups: { id: string; name: string; funds: { id: string; name: string; status: string; rows: { symbol: string; name: string; previous: number; current: number; delta: number }[] }[] }[];
} {
  const groups = etfGroups.map((group) => ({
    id: group.id,
    name: group.name,
    funds: group.instrumentIds.map((id) => {
      const dates = db.prepare(`
        SELECT DISTINCT as_of FROM etf_holdings WHERE etf_symbol = ? ORDER BY as_of
      `).all(id) as { as_of: string }[];
      const latest = dates.at(-1)?.as_of;
      const previous = dates.length > 1 ? dates[dates.length - 2].as_of : null;
      const load = (asOf: string | undefined) => {
        if (!asOf) return [];
        return db.prepare(`
          SELECT constituent_symbol AS symbol, constituent_name AS name, weight
          FROM etf_holdings WHERE etf_symbol = ? AND as_of = ?
        `).all(id, asOf) as { symbol: string; name: string; weight: number }[];
      };
      const changes = holdingWeightChanges(previous ? load(previous) : null, latest ? load(latest) : null);
      return {
        id,
        name: instrumentById(id)?.name ?? id,
        status: changes ? `${previous} → ${latest}` : "수집 중 (비중 스냅샷 2일 필요)",
        rows: changes ?? [],
      };
    }),
  }));
  return { groups };
}

export type FilingRow = {
  rceptNo: string;
  corpName: string;
  reportName: string;
  category: string;
  rceptDt: string;
  url: string;
  parseStatus: string;
  capFilter: string;
  marketCapKrw: number | null;
};

export function loadFilings(db: AppDatabase): FilingRow[] {
  const rows = db.prepare(`
    SELECT rcept_no, corp_name, report_name, category, rcept_dt, url, parse_status, cap_filter, market_cap_krw
    FROM filings WHERE cap_filter != 'exclude' ORDER BY rcept_dt DESC, rcept_no DESC LIMIT 200
  `).all() as {
    rcept_no: string;
    corp_name: string;
    report_name: string;
    category: string;
    rcept_dt: string;
    url: string;
    parse_status: string;
    cap_filter: string;
    market_cap_krw: number | null;
  }[];
  return rows.map((row) => ({
    rceptNo: row.rcept_no,
    corpName: row.corp_name,
    reportName: row.report_name,
    category: row.category,
    rceptDt: row.rcept_dt,
    url: row.url,
    parseStatus: row.parse_status,
    capFilter: row.cap_filter,
    marketCapKrw: row.market_cap_krw,
  }));
}

export function loadFlows(db: AppDatabase): { date: string; deposits: number | null; credit: number | null; creditPct: number | null; kospi: number | null; kosdaq: number | null }[] {
  const rows = db.prepare(`
    SELECT date, deposits, credit_balance, credit_mcap_pct, kospi_value, kosdaq_value
    FROM flow_daily ORDER BY date
  `).all() as {
    date: string;
    deposits: number | null;
    credit_balance: number | null;
    credit_mcap_pct: number | null;
    kospi_value: number | null;
    kosdaq_value: number | null;
  }[];
  return rows.map((row) => ({
    date: row.date,
    deposits: row.deposits,
    credit: row.credit_balance,
    creditPct: row.credit_mcap_pct,
    kospi: row.kospi_value,
    kosdaq: row.kosdaq_value,
  }));
}

export function loadOverseas(db: AppDatabase, window: string): { asOf: string | null; rows: { rank: number; name: string; buy: number; sell: number; net: number }[] } {
  const latest = db.prepare("SELECT MAX(as_of) AS as_of FROM overseas_trades WHERE window = ?").get(window) as { as_of: string | null };
  if (!latest?.as_of) return { asOf: null, rows: [] };
  const rows = db.prepare(`
    SELECT rank, name, buy, sell, net FROM overseas_trades WHERE window = ? AND as_of = ? ORDER BY rank
  `).all(window, latest.as_of) as { rank: number; name: string; buy: number; sell: number; net: number }[];
  return { asOf: latest.as_of, rows };
}

export function loadConcalls(db: AppDatabase): { title: string; heldAt: string; period: string; url: string }[] {
  const rows = db.prepare("SELECT title, held_at, period, url FROM concalls ORDER BY held_at DESC").all() as {
    title: string;
    held_at: string;
    period: string;
    url: string;
  }[];
  return rows.map((row) => ({ title: row.title, heldAt: row.held_at, period: row.period, url: row.url }));
}

export function loadMonthly(db: AppDatabase, source: string): { key: string; label: string; unit: string; extra: string | null; points: { period: string; value: number }[] }[] {
  const rows = db.prepare(`
    SELECT series_key, period, value, unit, label, extra_json
    FROM monthly_series WHERE source = ? ORDER BY series_key, period
  `).all(source) as { series_key: string; period: string; value: number; unit: string; label: string; extra_json: string | null }[];
  const grouped = new Map<string, { key: string; label: string; unit: string; extra: string | null; points: { period: string; value: number }[] }>();
  for (const row of rows) {
    const current = grouped.get(row.series_key) ?? {
      key: row.series_key,
      label: row.label,
      unit: row.unit,
      extra: row.extra_json,
      points: [],
    };
    current.points.push({ period: row.period, value: row.value });
    current.label = row.label;
    current.extra = row.extra_json;
    grouped.set(row.series_key, current);
  }
  return [...grouped.values()];
}

export function loadTaiwanSectors(db: AppDatabase): { sector: string; yoy: number | null; names: { symbol: string; name: string; latest: number | null; mom: number | null; yoy: number | null }[] }[] {
  const series = loadMonthly(db, "taiwan");
  const sectors = new Map<string, typeof series>();
  for (const item of series) {
    const sector = item.extra ? (JSON.parse(item.extra) as { sector?: string }).sector ?? "기타" : "기타";
    const list = sectors.get(sector) ?? [];
    list.push(item);
    sectors.set(sector, list);
  }
  return [...sectors.entries()].map(([sector, names]) => {
    const latestPeriod = names.flatMap((item) => item.points.map((point) => point.period)).sort().at(-1);
    const priorPeriod = latestPeriod ? `${Number(latestPeriod.slice(0, 4)) - 1}${latestPeriod.slice(4)}` : null;
    const previousMonth = latestPeriod ? shiftMonth(latestPeriod, -1) : null;
    let pairedCurrent = 0;
    let pairedPrior = 0;
    let paired = false;
    const rows = names.map((item) => {
      const latest = latestPeriod ? item.points.find((point) => point.period === latestPeriod)?.value ?? null : null;
      const prior = priorPeriod ? item.points.find((point) => point.period === priorPeriod)?.value ?? null : null;
      const prevMonth = previousMonth ? item.points.find((point) => point.period === previousMonth)?.value ?? null : null;
      if (latest != null && prior != null) {
        pairedCurrent += latest;
        pairedPrior += prior;
        paired = true;
      }
      return {
        symbol: item.key,
        name: item.label,
        latest,
        mom: revenueYoy(latest, prevMonth),
        yoy: revenueYoy(latest, prior),
      };
    });
    return { sector, yoy: paired ? revenueYoy(pairedCurrent, pairedPrior) : null, names: rows };
  });
}

function shiftMonth(period: string, delta: number): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${nextMonth}`;
}

export type RatioCard = {
  id: string;
  name: string;
  ratio: number | null;
  asOf: string | null;
  numerator: string;
  denominator: string;
  high: number | null;
  low: number | null;
  series: { date: string; value: number }[];
  note: string | null;
};

export function loadRatios(db: AppDatabase): RatioCard[] {
  const { fx } = fxFrom(db);
  return mcapPairs.map((pair) => {
    const legs = [...pair.numeratorIds, ...pair.denominatorIds].map((id) => listDailyBars(db, id));
    const fxBars = {
      usdkrw: new Map(listDailyBars(db, fxIds.usdkrw).map((bar) => [bar.date, bar.close])),
      usdjpy: new Map(listDailyBars(db, fxIds.usdjpy).map((bar) => [bar.date, bar.close])),
      eurkrw: new Map(listDailyBars(db, fxIds.eurkrw).map((bar) => [bar.date, bar.close])),
    };
    const dates = uniqueDates(legs.flat());
    const series: { date: string; value: number }[] = [];
    let usedApprox = false;
    for (const date of dates) {
      const rates: FxRates = {
        usdkrw: fxBars.usdkrw.get(date) ?? null,
        eurkrw: fxBars.eurkrw.get(date) ?? null,
        usdjpy: fxBars.usdjpy.get(date) ?? null,
      };
      const num = capsOn(db, pair.numeratorIds, date, rates);
      const den = capsOn(db, pair.denominatorIds, date, rates);
      if (!num || !den) continue;
      if (num.approx || den.approx) usedApprox = true;
      const ratio = marketCapRatio(num.values, den.values);
      if (ratio != null) series.push({ date, value: ratio });
    }
    const currentNum = capsNow(db, pair.numeratorIds, fx);
    const currentDen = capsNow(db, pair.denominatorIds, fx);
    const ratio = currentNum && currentDen ? marketCapRatio(currentNum, currentDen) : series.at(-1)?.value ?? null;
    const values = series.map((point) => point.value);
    return {
      id: pair.id,
      name: pair.name,
      ratio,
      asOf: series.at(-1)?.date ?? null,
      numerator: describeCaps(db, pair.numeratorIds),
      denominator: describeCaps(db, pair.denominatorIds),
      high: values.length ? Math.max(...values) : null,
      low: values.length ? Math.min(...values) : null,
      series,
      note: usedApprox ? "과거 시총 일부는 최근 발행주식수 × 과거 종가입니다." : null,
    };
  });
}

function uniqueDates(bars: { date: string }[]): string[] {
  return [...new Set(bars.map((bar) => bar.date))].sort();
}

function capsOn(
  db: AppDatabase,
  ids: string[],
  date: string,
  fx: FxRates,
): { values: number[]; approx: boolean } | null {
  const values: number[] = [];
  let approx = false;
  for (const id of ids) {
    const bar = db.prepare("SELECT market_cap, market_cap_basis, close FROM daily_bars WHERE instrument_id = ? AND date = ?").get(id, date) as
      | { market_cap: number | null; market_cap_basis: string | null; close: number }
      | undefined;
    const instrument = db.prepare("SELECT currency FROM instruments WHERE id = ?").get(id) as { currency: string } | undefined;
    if (!bar || !instrument) return null;
    const cap = bar.market_cap;
    if (cap == null) return null;
    if (bar.market_cap_basis === "price_times_shares") approx = true;
    const usd = toUsd(cap, instrument.currency, fx);
    if (usd == null) return null;
    values.push(usd);
  }
  return { values, approx };
}

function capsNow(db: AppDatabase, ids: string[], fx: FxRates): number[] | null {
  const values: number[] = [];
  for (const id of ids) {
    const row = db.prepare("SELECT market_cap, market_cap_currency, currency FROM instruments WHERE id = ?").get(id) as
      | { market_cap: number | null; market_cap_currency: string | null; currency: string }
      | undefined;
    if (!row?.market_cap) return null;
    const usd = toUsd(row.market_cap, row.market_cap_currency || row.currency, fx);
    if (usd == null) return null;
    values.push(usd);
  }
  return values;
}

function describeCaps(db: AppDatabase, ids: string[]): string {
  return ids
    .map((id) => {
      const row = db.prepare("SELECT name, market_cap, market_cap_currency, currency FROM instruments WHERE id = ?").get(id) as
        | { name: string; market_cap: number | null; market_cap_currency: string | null; currency: string }
        | undefined;
      if (!row) return id;
      if (row.market_cap == null) return `${row.name} 시총 없음`;
      return `${row.name} ${formatCompact(row.market_cap, row.market_cap_currency || row.currency)}`;
    })
    .join(" + ");
}

export type MoverRow = {
  id: string;
  name: string;
  market: string;
  daily: number | null;
  weekly: number | null;
  high: boolean;
  sessions: number;
  marketCap: string;
};

type NaverRankRow = {
  market: string;
  item_code: string;
  name: string;
  change_pct: number | null;
  market_cap_krw: number | null;
  as_of: string | null;
};

function moverFromCloses(id: string, name: string, market: string, closes: number[], marketCap: string, dailyOverride: number | null): { row: MoverRow; shortWindow: boolean } {
  const high = fiftyTwoWeekHigh(closes);
  return {
    shortWindow: high?.shortWindow ?? false,
    row: {
      id,
      name,
      market,
      daily: dailyOverride ?? trailingReturn(closes, 1),
      weekly: trailingReturn(closes, 5),
      high: high?.high ?? false,
      sessions: high?.sessions ?? 0,
      marketCap,
    },
  };
}

export function loadMovers(db: AppDatabase): { rows: MoverRow[]; shortWindow: boolean; excluded: number; naverAsOf: string | null } {
  const instruments = db.prepare(`
    SELECT id, name, symbol, currency, instrument_class, mover_market, market_cap, market_cap_currency, kind
    FROM instruments WHERE mover_market IS NOT NULL AND active = 1
  `).all() as InstrumentRow[];
  const naverRanks = db.prepare(`
    SELECT market, item_code, name, change_pct, market_cap_krw, as_of FROM naver_ranks ORDER BY market, rank
  `).all() as NaverRankRow[];
  const naverMarkets = new Set(naverRanks.map((row) => row.market));
  const rows: MoverRow[] = [];
  let excluded = 0;
  let shortWindow = false;
  for (const item of instruments) {
    if (item.mover_market && naverMarkets.has(item.mover_market)) continue;
    const capCurrency = (item.market_cap_currency || item.currency) === "KRW" ? "KRW" : "USD";
    const decision = moverExclusion({
      marketCap: item.market_cap,
      capCurrency,
      instrumentClass: item.instrument_class,
    });
    if (decision.excluded) {
      excluded += 1;
      continue;
    }
    const closes = listDailyBars(db, item.id).map((bar) => bar.close);
    const built = moverFromCloses(
      item.id,
      item.name,
      item.mover_market ?? "",
      closes,
      item.market_cap == null ? "시총 없음" : formatCompact(item.market_cap, capCurrency),
      null,
    );
    if (built.shortWindow) shortWindow = true;
    rows.push(built.row);
  }
  for (const rank of naverRanks) {
    const suffix = rank.market === "KOSPI" ? ".KS" : ".KQ";
    const closes = listDailyBars(db, `${rank.item_code}${suffix}`).map((bar) => bar.close);
    const built = moverFromCloses(
      `naver:${rank.market}:${rank.item_code}`,
      rank.name,
      rank.market,
      closes,
      rank.market_cap_krw == null ? "시총 없음" : formatCompact(rank.market_cap_krw, "KRW"),
      rank.change_pct,
    );
    if (built.shortWindow) shortWindow = true;
    rows.push(built.row);
  }
  return { rows, shortWindow, excluded, naverAsOf: naverRanks[0]?.as_of ?? null };
}

export type NaverIndexRow = {
  itemCode: string;
  name: string;
  price: number;
  changePct: number | null;
  asOf: string | null;
};

export function loadNaverIndexes(db: AppDatabase): NaverIndexRow[] {
  return (db.prepare("SELECT item_code, name, price, change_pct, as_of FROM naver_indexes ORDER BY item_code").all() as {
    item_code: string;
    name: string;
    price: number;
    change_pct: number | null;
    as_of: string | null;
  }[]).map((row) => ({
    itemCode: row.item_code,
    name: row.name,
    price: row.price,
    changePct: row.change_pct,
    asOf: row.as_of,
  }));
}

export function loadHealth(db: AppDatabase): IngestRunRow[] {
  return listIngestRuns(db, 40);
}

export function formatFlow(value: number | null, currency: string): string {
  if (value == null) return "NAV 없음";
  return formatCompact(value, currency);
}

export function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${formatSigned(value)}%`;
}

export function formatPlain(value: number | null, digits = 2): string {
  if (value == null) return "—";
  return formatNumber(value, digits);
}
