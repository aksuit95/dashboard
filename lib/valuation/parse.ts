import type { ValuationData, ValuationSeries } from "./types";

export type SourceSheet = { name: string; rows: unknown[][] };
export const definitions = [
  { id: "per", code: "E382160", name: "선행 PER", unit: "배", digits: 2, color: "#38bdf8" },
  { id: "pbr", code: "E382560", name: "선행 PBR", unit: "배", digits: 2, color: "#a78bfa" },
  { id: "eps", code: "E312060", name: "선행 EPS · 지배", unit: "원", digits: 0, color: "#34d399" },
  { id: "bps", code: "E314060", name: "선행 BPS · 지배", unit: "원", digits: 0, color: "#fbbf24" },
  { id: "evEbitda", code: "E331060", name: "선행 EV/EBITDA", unit: "배", digits: 2, color: "#fb923c" },
  { id: "operatingProfit", code: "E121560", name: "선행 영업이익", unit: "억원", digits: 0, color: "#f472b6" },
  { id: "fcf", code: "E124260", name: "선행 FCF", unit: "억원", digits: 0, color: "#2dd4bf" },
] as const;

function text(value: unknown): string { return String(value ?? "").trim(); }
function normalize(value: unknown): string { return text(value).replace(/\s/g, "").toUpperCase(); }
function numeric(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?[\d,]+(?:\.\d+)?$/.test(value.trim()) ? Number(value.replaceAll(",", "")) : NaN;
  return Number.isFinite(n) ? n : null;
}
export function valuationDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  let raw = text(value);
  if (/^\d{8}$/.test(raw)) raw = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  raw = raw.replace(/[./]/g, "-");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(raw);
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseValuationSheets(sheets: SourceSheet[], fileName: string, savedAt: string, today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)): ValuationData {
  const candidates = new Map<string, ValuationSeries[]>();
  const warnings = new Set<string>();
  let sourceUpdatedAt: string | null = null;
  for (const sheet of sheets) {
    const header = sheet.rows.findIndex((row) => normalize(row[0]) === "DATE");
    if (header < 0) continue;
    const metadata = (label: string) => sheet.rows.slice(0, header).find((row) => normalize(row[0]) === label);
    const codes = metadata("CODE");
    const items = metadata("ITEMCODE");
    const units = metadata("UNIT");
    const update = sheet.rows.slice(0, header).flat().map(text).find((v) => v.startsWith("Last Update"));
    const timestamp = update?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0];
    if (timestamp && (!sourceUpdatedAt || timestamp > sourceUpdatedAt)) sourceUpdatedAt = timestamp;
    if (!codes || !items) continue;
    let undated = 0;
    for (const row of sheet.rows.slice(header + 1)) {
      if (!valuationDate(row[0]) && row.slice(1).some((v) => numeric(v) != null)) undated++;
    }
    if (undated) warnings.add(`${sheet.name}: 날짜가 없는 ${undated.toLocaleString("ko-KR")}행은 차트에서 제외했습니다.`);
    for (let column = 1; column < items.length; column++) {
      // Do not interpret a leftover metadata column as a second, empty series.
      if (normalize(codes[column]) !== "IKS200" || !text(sheet.rows[header][column])) continue;
      const itemCode = text(items[column]);
      const definition = definitions.find((d) => d.code === itemCode.split(".")[0]);
      if (!definition) continue;
      const unit = text(units?.[column]);
      const factor = definition.unit !== "억원" ? 1 : /thou/i.test(unit) ? 1 / 100_000 : /100mn/i.test(unit) ? 1 : /bil/i.test(unit) ? 10 : /mn/i.test(unit) ? 1 / 100 : /^(Local|KRW)$/i.test(unit) ? 1 / 100_000_000 : null;
      if (factor == null) { warnings.add(`${sheet.name}: ${definition.name}의 단위(${unit})를 확인할 수 없어 제외했습니다.`); continue; }
      const byDate = new Map<string, number>();
      for (const row of sheet.rows.slice(header + 1)) {
        const date = valuationDate(row[0]);
        const value = numeric(row[column]);
        if (!date || date > today || value == null) continue;
        if (byDate.has(date) && byDate.get(date) !== value * factor) warnings.add(`${sheet.name}: ${definition.name}의 중복 날짜는 마지막 행을 사용했습니다.`);
        byDate.set(date, value * factor);
      }
      if (!byDate.size) continue;
      const series: ValuationSeries = { ...definition, sheet: sheet.name, itemCode, points: [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })) };
      candidates.set(definition.id, [...(candidates.get(definition.id) ?? []), series]);
    }
  }
  const series: ValuationSeries[] = [];
  for (const definition of definitions) {
    const options = candidates.get(definition.id)?.sort((a, b) => b.points.length - a.points.length || b.points.at(-1)!.date.localeCompare(a.points.at(-1)!.date));
    if (!options?.length) continue;
    const chosen = options[0];
    const reference = new Map(chosen.points.map((p) => [p.date, p.value]));
    for (const alternative of options.slice(1)) {
      if (alternative.points.some((p) => reference.has(p.date) && Math.abs(reference.get(p.date)! - p.value) > 0.000001 * Math.max(1, Math.abs(p.value)))) {
        warnings.add(`${definition.name}: ${chosen.sheet}와 ${alternative.sheet}의 동일 날짜 값이 다릅니다. 유효 관측값이 더 많은 ${chosen.sheet}를 사용했습니다. 원본 날짜 정렬을 확인해 주세요.`);
      }
    }
    series.push(chosen);
  }
  if (!series.length) throw new Error("코스피200(IKS200)의 날짜·항목 코드·수치가 있는 QuantiWise 조회표를 찾지 못했습니다.");
  return { fileName, savedAt, sourceUpdatedAt, series, warnings: [...warnings] };
}
