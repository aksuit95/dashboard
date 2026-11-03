import { definitions, valuationDate, type SourceSheet } from "./parse";

export const stockMetrics = [
  ...definitions,
  { id: "epsTotal", code: "E312080", name: "선행 EPS · 전체", unit: "원", digits: 0, color: "#6ee7b7" },
  { id: "bpsTotal", code: "E314070", name: "선행 BPS · 전체", unit: "원", digits: 0, color: "#fcd34d" },
] as const;
export type StockMetric = typeof stockMetrics[number]["id"];
export type ValuationStock = { code: string; name: string; values: Partial<Record<StockMetric, number | null>> };
export type StockValuationData = {
  fileName: string; savedAt: string; sourceUpdatedAt: string | null; compositionDate: string;
  metrics: { id: StockMetric; itemCode: string; sourceUnit: string; baseDate: string }[];
  stocks: ValuationStock[]; warnings: string[];
};
export type StockValuationSnapshot = { schemaVersion: 1; exportedAt: string; data: StockValuationData };
const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).replace(/\s/g, "").toUpperCase();

export function parseStockValuation(sheets: SourceSheet[], fileName: string, savedAt: string): StockValuationData {
  const candidates = sheets.filter(s => s.rows.some(r => normalized(r[0]) === "CODE" && normalized(r[1]) === "NAME") && s.rows.some(r => normalized(r[1]) === "ACCOUNT"));
  if (candidates.length !== 1) throw new Error("종목별 QuantiWise Peer Analysis 조회표가 하나 있어야 합니다.");
  const sheet = candidates[0];
  const header = sheet.rows.findIndex(r => normalized(r[0]) === "CODE" && normalized(r[1]) === "NAME");
  const meta = sheet.rows.slice(0, header);
  const accounts = meta.find(r => normalized(r[1]) === "ACCOUNT")!;
  const units = meta.find(r => normalized(r[1]) === "UNIT");
  const dates = meta.find(r => normalized(r[1]) === "BASEDATE");
  const composition = meta.find(r => normalized(r[0]) === "COMPOSITIONDATE");
  const compositionDate = valuationDate(text(composition?.[1]).match(/\d{8}/)?.[0]);
  if (!compositionDate) throw new Error("종목 구성 기준일을 읽지 못했습니다.");
  const sourceUpdatedAt = meta.flat().map(text).find(v => v.startsWith("Last Update"))?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null;
  const columns = stockMetrics.flatMap(metric => {
    const column = accounts.findIndex(value => text(value).split(".")[0] === metric.code);
    if (column < 0) return [];
    const unit = text(units?.[column]);
    const factor = metric.unit === "억원" ? /thou/i.test(unit) ? 1 / 100_000 : /100mn/i.test(unit) ? 1 : /bil/i.test(unit) ? 10 : /mn/i.test(unit) ? 1 / 100 : /^(Local|KRW)$/i.test(unit) ? 1 / 100_000_000 : null : metric.unit === "배" ? /^X$/i.test(unit) ? 1 : null : /^(Local|KRW)\/Shares$/i.test(unit) ? 1 : null;
    if (factor == null) throw new Error(`${metric.name}의 단위(${unit})를 확인해 주세요.`);
    return [{ id: metric.id, itemCode: text(accounts[column]), sourceUnit: unit, baseDate: text(dates?.[column]), column, factor }];
  });
  if (!columns.length) throw new Error("지원하는 개별종목 밸류에이션 항목이 없습니다.");
  const stocks: ValuationStock[] = [];
  const codes = new Set<string>();
  for (const row of sheet.rows.slice(header + 1)) {
    const raw = text(row[0]);
    if (!raw) continue;
    if (!/^A[0-9A-Z]{6}$/.test(raw) || !text(row[1])) throw new Error(`종목 코드 또는 이름을 확인해 주세요: ${raw}`);
    const code = raw.slice(1);
    if (codes.has(code)) throw new Error(`중복 종목 코드: ${code}`);
    codes.add(code);
    const values: ValuationStock["values"] = {};
    for (const metric of columns) {
      const value = row[metric.column];
      const number = typeof value === "number" ? value : typeof value === "string" && /^-?[\d,]+(?:\.\d+)?$/.test(value.trim()) ? Number(value.replaceAll(",", "")) : NaN;
      values[metric.id] = Number.isFinite(number) ? number * metric.factor : null;
    }
    stocks.push({ code, name: text(row[1]), values });
  }
  if (!stocks.length) throw new Error("종목별 밸류에이션 데이터가 없습니다.");
  return { fileName, savedAt, sourceUpdatedAt, compositionDate, metrics: columns.map(({ id, itemCode, sourceUnit, baseDate }) => ({ id, itemCode, sourceUnit, baseDate })), stocks, warnings: [] };
}
