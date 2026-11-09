export type IndicatorPoint = { date: string; value: number };
export type AlignedIndicatorPoint = { date: string; value: number | null; sourceDate: string | null };
export type IndicatorRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y";
const days: Record<IndicatorRange, number> = { "1W": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827 };
export function validateIndicatorPoints(input: unknown): IndicatorPoint[] {
  if (!Array.isArray(input) || !input.length) throw new Error("데이터가 비어 있습니다.");
  let last = "";
  return input.map(row => {
    if (!row || typeof row !== "object" || typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date || row.date <= last || typeof row.value !== "number" || !Number.isFinite(row.value)) throw new Error("날짜 또는 값이 올바르지 않습니다.");
    last = row.date;
    return { date: row.date, value: row.value };
  });
}
export function selectIndicatorRange<T extends { date: string }>(points: T[], range: IndicatorRange, end: string): T[] {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const start = new Date(endMs - days[range] * 86400000).toISOString().slice(0, 10);
  return points.filter(point => point.date >= start && point.date <= end);
}
/** Fill only known closures after a real observation; an unexplained gap blocks carrying. */
export function alignIndicator(points: IndicatorPoint[], dates: string[], knownHolidays: Set<string>): AlignedIndicatorPoint[] {
  if (!points.length) return [];
  const values = new Map(points.map(point => [point.date, point.value]));
  const first = points[0].date;
  let prior: IndicatorPoint | null = null;
  let canCarry = false;
  return dates.map(date => {
    const value = values.get(date);
    if (value !== undefined) { prior = { date, value }; canCarry = true; return { date, value, sourceDate: date }; }
    if (date < first) return { date, value: null, sourceDate: null };
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const isClosure = day === 0 || day === 6 || knownHolidays.has(date);
    if (isClosure && canCarry && prior) return { date, value: prior.value, sourceDate: prior.date };
    canCarry = false;
    return { date, value: null, sourceDate: null };
  });
}
export function calendarDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`);
  for (; current.getTime() <= last; current.setUTCDate(current.getUTCDate() + 1)) dates.push(current.toISOString().slice(0, 10));
  return dates;
}
/** Preserve explicit gaps when reducing long series, so missing sessions are never bridged. */
export function downsampleAligned(points: AlignedIndicatorPoint[], maxPoints = 500): AlignedIndicatorPoint[] {
  if (points.length <= maxPoints) return points;
  const groups: AlignedIndicatorPoint[][] = [];
  let current: AlignedIndicatorPoint[] = [];
  for (const point of points) {
    if (point.value === null) {
      if (current.length) { groups.push(current); current = []; }
      if (!groups.length || groups[groups.length - 1][0].value !== null) groups.push([point]);
    } else current.push(point);
  }
  if (current.length) groups.push(current);
  const breaks = groups.filter(group => group[0].value === null).length;
  const values = groups.reduce((n, group) => n + (group[0].value === null ? 0 : group.length), 0);
  const budget = Math.max(2, maxPoints - breaks);
  return groups.flatMap(group => {
    if (group[0].value === null || group.length <= 2) return group;
    const share = Math.max(4, Math.floor(budget * group.length / values));
    const numeric = group.map(point => ({ date: point.date, value: point.value! }));
    const keep = new Set(downsampleIndicator(numeric, share).map(point => point.date));
    return group.filter(point => keep.has(point.date));
  });
}
export type ChangeMethod = "return" | "absolute";
/** Index and FX start at 100; ADR and interest rates show differences in percentage points. */
export function normalizeIndicator(points: IndicatorPoint[], method: ChangeMethod): IndicatorPoint[] {
  if (!points.length) return [];
  const base = points[0].value;
  if (method === "return" && base <= 0) throw new Error("시작값이 0 이하여서 정규화할 수 없습니다.");
  return points.map(point => ({ date: point.date, value: method === "return" ? point.value / base * 100 : point.value - base }));
}
export function indicatorChange(value: number, base: number, method: ChangeMethod, unit: "bp" | "pp" | null): string {
  if (method === "return") {
    if (base <= 0) return "—";
    const delta = (value / base - 1) * 100;
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`;
  }
  const delta = (value - base) * (unit === "bp" ? 100 : 1);
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(unit === "bp" ? 0 : 2)}${unit === "bp" ? "bp" : "%p"}`;
}
/** Keep bucket extrema in chronological order so long ranges preserve spikes. */
export function downsampleIndicator(points: IndicatorPoint[], maxPoints = 500): IndicatorPoint[] {
  if (points.length <= maxPoints) return points;
  const bucketSize = Math.ceil((points.length - 2) / Math.max(1, Math.floor((maxPoints - 2) / 2)));
  const selected: IndicatorPoint[] = [points[0]];
  for (let start = 1; start < points.length - 1; start += bucketSize) {
    const bucket = points.slice(start, Math.min(start + bucketSize, points.length - 1));
    let low = 0, high = 0;
    for (let i = 1; i < bucket.length; i++) { if (bucket[i].value < bucket[low].value) low = i; if (bucket[i].value > bucket[high].value) high = i; }
    for (const i of [...new Set([low, high])].sort((a, b) => a - b)) selected.push(bucket[i]);
  }
  selected.push(points[points.length - 1]);
  return selected;
}
