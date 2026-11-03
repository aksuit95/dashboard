export const investors = ["individual", "foreign", "institution"] as const;
export type Investor = typeof investors[number];
export type FlowValues = Record<Investor, number | null>;
export type InvestorPoint = FlowValues & { date: string };
export type FlowPeriod = 1 | 5 | 20 | 60;
export const investorNames: Record<Investor, string> = { individual: "개인", foreign: "외국인", institution: "기관" };
export const investorColors: Record<Investor, string> = { individual: "#fb7185", foreign: "#38bdf8", institution: "#fbbf24" };

/** Windows use a shared exchange session grid; missing days never become zero. */
export function windowSum(points: InvestorPoint[], investor: Investor, days: number): number | null {
  if (points.length < days) return null;
  const values = points.slice(-days).map(p => p[investor]);
  return values.some(v => v == null) ? null : values.reduce<number>((sum, v) => sum + v!, 0);
}
export function buyingStreak(points: InvestorPoint[], investor: Investor): { days: number; atLeast: boolean } | null {
  if (!points.length || points.at(-1)![investor] == null) return null;
  let days = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    const value = points[i][investor];
    if (value == null) return { days, atLeast: days > 0 };
    if (value <= 0) return { days, atLeast: false };
    days++;
  }
  return { days, atLeast: true };
}
export function alignFlows(points: InvestorPoint[], sessions: string[]): InvestorPoint[] {
  const lookup = new Map(points.map(p => [p.date, p]));
  return sessions.map(date => lookup.get(date) ?? { date, individual: null, foreign: null, institution: null });
}
export function aggregateFlows(series: InvestorPoint[][], sessions: string[]): InvestorPoint[] {
  const aligned = series.map(points => alignFlows(points, sessions));
  return sessions.map((date, i) => ({ date, ...Object.fromEntries(investors.map(key => {
    const values = aligned.map(rows => rows[i][key]);
    return [key, !values.length || values.some(v => v == null) ? null : values.reduce<number>((sum, v) => sum + v!, 0)];
  })) } as InvestorPoint));
}
export function capRatio(amount: number | null, marketCap: number): number | null {
  return amount == null || !Number.isFinite(marketCap) || marketCap <= 0 ? null : amount / marketCap * 100;
}
export function rollingFlows(points: InvestorPoint[], days: FlowPeriod): InvestorPoint[] {
  return points.map((point, index) => ({ date: point.date, ...Object.fromEntries(investors.map(key => [key, windowSum(points.slice(0, index + 1), key, days)])) } as InvestorPoint));
}
/** Accumulate from the first selected session. Once a value is missing, the subsequent cumulative total is unknown. */
export function cumulativeFlows(points: InvestorPoint[]): InvestorPoint[] {
  const totals: FlowValues = { individual: 0, foreign: 0, institution: 0 };
  return points.map(point => {
    const values = Object.fromEntries(investors.map(key => {
      const value = point[key];
      totals[key] = totals[key] == null || value == null ? null : totals[key]! + value;
      return [key, totals[key]];
    })) as FlowValues;
    return { date: point.date, ...values };
  });
}
