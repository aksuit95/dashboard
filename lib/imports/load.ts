import type { AppDatabase } from "@/lib/db/client";
import { headerMatches, numberCell, parseCsv, type CsvResult } from "@/lib/imports/csv";

export type ImportResult = { ok: true; rowCount: number } | { ok: false; reason: string };

function fail(reason: string): ImportResult {
  return { ok: false, reason };
}

function record(db: AppDatabase, kind: string, asOf: string | null, rowCount: number, at: string): void {
  db.prepare("INSERT INTO imports (kind, as_of, created_at, row_count) VALUES (?, ?, ?, ?)").run(kind, asOf, at, rowCount);
}

export function importBreadth(db: AppDatabase, text: string, at = new Date().toISOString()): ImportResult {
  const parsed = parseTable(text, ["market", "date", "advancers", "decliners", "unchanged"]);
  if (!parsed.ok) return parsed;
  const rows: { market: string; date: string; advancers: number; decliners: number; unchanged: number }[] = [];
  for (const [index, cells] of parsed.rows.entries()) {
    const market = cells[0];
    const date = cells[1];
    if (market !== "KOSPI" && market !== "KOSDAQ") return fail(`${index + 2}행 시장은 KOSPI 또는 KOSDAQ 입니다.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(`${index + 2}행 날짜 형식은 YYYY-MM-DD 입니다.`);
    const advancers = numberCell(cells[2], "상승");
    const decliners = numberCell(cells[3], "하락");
    const unchanged = numberCell(cells[4], "보합");
    if (typeof advancers !== "number") return fail(`${index + 2}행 ${advancers.error}`);
    if (typeof decliners !== "number") return fail(`${index + 2}행 ${decliners.error}`);
    if (typeof unchanged !== "number") return fail(`${index + 2}행 ${unchanged.error}`);
    rows.push({ market, date, advancers, decliners, unchanged });
  }
  const statement = db.prepare(`
    INSERT INTO breadth_daily (market, date, advancers, decliners, unchanged)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(market, date) DO UPDATE SET
      advancers = excluded.advancers,
      decliners = excluded.decliners,
      unchanged = excluded.unchanged
  `);
  for (const row of rows) statement.run(row.market, row.date, row.advancers, row.decliners, row.unchanged);
  record(db, "breadth", rows[0]?.date ?? null, rows.length, at);
  return { ok: true, rowCount: rows.length };
}

export function importFlow(db: AppDatabase, text: string, at = new Date().toISOString()): ImportResult {
  const parsed = parseTable(text, ["date", "deposits", "credit_balance", "credit_mcap_pct", "kospi_value", "kosdaq_value"]);
  if (!parsed.ok) return parsed;
  const rows: (number | string | null)[][] = [];
  for (const [index, cells] of parsed.rows.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) return fail(`${index + 2}행 날짜 형식은 YYYY-MM-DD 입니다.`);
    const numbers = cells.slice(1).map((cell, cellIndex) => {
      if (cell === "") return null;
      return numberCell(cell, `열 ${cellIndex + 2}`);
    });
    const invalid = numbers.find((value) => value !== null && typeof value !== "number") as { error: string } | undefined;
    if (invalid) return fail(`${index + 2}행 ${invalid.error}`);
    rows.push([cells[0], ...(numbers as (number | null)[])]);
  }
  const statement = db.prepare(`
    INSERT INTO flow_daily (date, deposits, credit_balance, credit_mcap_pct, kospi_value, kosdaq_value)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      deposits = excluded.deposits,
      credit_balance = excluded.credit_balance,
      credit_mcap_pct = excluded.credit_mcap_pct,
      kospi_value = excluded.kospi_value,
      kosdaq_value = excluded.kosdaq_value
  `);
  for (const row of rows) statement.run(...row);
  record(db, "fund-flow", String(rows[0]?.[0] ?? ""), rows.length, at);
  return { ok: true, rowCount: rows.length };
}

export function importHoldings(db: AppDatabase, text: string, at = new Date().toISOString()): ImportResult {
  const parsed = parseTable(text, ["etf_symbol", "as_of", "constituent_symbol", "constituent_name", "weight_pct"]);
  if (!parsed.ok) return parsed;
  const dates = new Set<string>();
  const rows: { etf: string; asOf: string; symbol: string; name: string; weight: number }[] = [];
  for (const [index, cells] of parsed.rows.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[1])) return fail(`${index + 2}행 날짜 형식은 YYYY-MM-DD 입니다.`);
    const weight = numberCell(cells[4], "비중");
    if (typeof weight !== "number") return fail(`${index + 2}행 ${weight.error}`);
    dates.add(`${cells[0]}|${cells[1]}`);
    rows.push({ etf: cells[0], asOf: cells[1], symbol: cells[2], name: cells[3], weight });
  }
  for (const key of dates) {
    const [etf, asOf] = key.split("|");
    db.prepare("DELETE FROM etf_holdings WHERE etf_symbol = ? AND as_of = ?").run(etf, asOf);
  }
  const statement = db.prepare(`
    INSERT INTO etf_holdings (etf_symbol, as_of, constituent_symbol, constituent_name, weight)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of rows) statement.run(row.etf, row.asOf, row.symbol, row.name, row.weight);
  record(db, "holdings", rows[0]?.asOf ?? null, rows.length, at);
  return { ok: true, rowCount: rows.length };
}

export function importOverseas(db: AppDatabase, text: string, at = new Date().toISOString()): ImportResult {
  const parsed = parseTable(text, ["window", "as_of", "rank", "name", "buy", "sell", "net"]);
  if (!parsed.ok) return parsed;
  const windows = new Set(["daily", "monthly", "ytd", "yearly"]);
  const groups = new Set<string>();
  const rows: { window: string; asOf: string; rank: number; name: string; buy: number; sell: number; net: number }[] = [];
  for (const [index, cells] of parsed.rows.entries()) {
    if (!windows.has(cells[0])) return fail(`${index + 2}행 구간은 daily, monthly, ytd, yearly 중 하나입니다.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[1])) return fail(`${index + 2}행 날짜 형식은 YYYY-MM-DD 입니다.`);
    const rank = numberCell(cells[2], "순위");
    const buy = numberCell(cells[4], "매수");
    const sell = numberCell(cells[5], "매도");
    const net = numberCell(cells[6], "순매수");
    if (typeof rank !== "number" || typeof buy !== "number" || typeof sell !== "number" || typeof net !== "number") {
      const bad = [rank, buy, sell, net].find((value) => typeof value !== "number") as { error: string };
      return fail(`${index + 2}행 ${bad.error}`);
    }
    groups.add(`${cells[0]}|${cells[1]}`);
    rows.push({ window: cells[0], asOf: cells[1], rank, name: cells[3], buy, sell, net });
  }
  for (const key of groups) {
    const [window, asOf] = key.split("|");
    db.prepare("DELETE FROM overseas_trades WHERE window = ? AND as_of = ?").run(window, asOf);
  }
  const statement = db.prepare(`
    INSERT INTO overseas_trades (window, as_of, rank, name, buy, sell, net)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) statement.run(row.window, row.asOf, row.rank, row.name, row.buy, row.sell, row.net);
  record(db, "overseas", rows[0]?.asOf ?? null, rows.length, at);
  return { ok: true, rowCount: rows.length };
}

export function importConcalls(db: AppDatabase, text: string, at = new Date().toISOString()): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("JSON 형식이 아닙니다.");
  }
  if (!Array.isArray(data) || data.length === 0) return fail("컨퍼런스콜 배열이 비어 있습니다.");
  const rows: { title: string; heldAt: string; period: string; url: string }[] = [];
  for (const [index, item] of data.entries()) {
    if (!item || typeof item !== "object") return fail(`${index + 1}번째 항목이 객체가 아닙니다.`);
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string" || typeof row.heldAt !== "string" || typeof row.period !== "string" || typeof row.url !== "string") {
      return fail(`${index + 1}번째 항목에 title, heldAt, period, url 문자열이 필요합니다.`);
    }
    rows.push({ title: row.title, heldAt: row.heldAt, period: row.period, url: row.url });
  }
  db.exec("DELETE FROM concalls");
  const statement = db.prepare("INSERT INTO concalls (title, held_at, period, url) VALUES (?, ?, ?, ?)");
  for (const row of rows) statement.run(row.title, row.heldAt, row.period, row.url);
  record(db, "concall", null, rows.length, at);
  return { ok: true, rowCount: rows.length };
}

export function importMonthly(
  db: AppDatabase,
  source: "trade" | "taiwan",
  text: string,
  at = new Date().toISOString(),
): ImportResult {
  const expected = source === "trade"
    ? ["series_key", "period", "value", "unit", "label"]
    : ["sector", "symbol", "name", "period", "revenue"];
  const parsed = parseTable(text, expected);
  if (!parsed.ok) return parsed;
  const rows: { key: string; period: string; value: number; unit: string; label: string; extra: string | null }[] = [];
  for (const [index, cells] of parsed.rows.entries()) {
    if (source === "trade") {
      if (!/^\d{4}-\d{2}$/.test(cells[1])) return fail(`${index + 2}행 기간은 YYYY-MM 입니다.`);
      const value = numberCell(cells[2], "값");
      if (typeof value !== "number") return fail(`${index + 2}행 ${value.error}`);
      rows.push({ key: cells[0], period: cells[1], value, unit: cells[3], label: cells[4], extra: null });
    } else {
      if (!/^\d{4}-\d{2}$/.test(cells[3])) return fail(`${index + 2}행 기간은 YYYY-MM 입니다.`);
      const value = numberCell(cells[4], "매출");
      if (typeof value !== "number") return fail(`${index + 2}행 ${value.error}`);
      rows.push({
        key: cells[1],
        period: cells[3],
        value,
        unit: "revenue",
        label: cells[2],
        extra: JSON.stringify({ sector: cells[0] }),
      });
    }
  }
  const statement = db.prepare(`
    INSERT INTO monthly_series (source, series_key, period, value, unit, label, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, series_key, period) DO UPDATE SET
      value = excluded.value,
      unit = excluded.unit,
      label = excluded.label,
      extra_json = excluded.extra_json
  `);
  for (const row of rows) statement.run(source, row.key, row.period, row.value, row.unit, row.label, row.extra);
  record(db, source, rows[0]?.period ?? null, rows.length, at);
  return { ok: true, rowCount: rows.length };
}

function parseTable(text: string, expected: string[]): CsvResult<string[]> {
  const table = parseCsv(text);
  if ("error" in table) return { ok: false, reason: table.error };
  if (!headerMatches(table.header, expected)) {
    return { ok: false, reason: `헤더는 ${expected.join(",")} 순이어야 합니다.` };
  }
  for (const [index, row] of table.rows.entries()) {
    if (row.length < expected.length) return { ok: false, reason: `${index + 2}행의 열이 부족합니다.` };
  }
  return { ok: true, rows: table.rows };
}
