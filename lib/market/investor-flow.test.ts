import { describe, expect, it } from "vitest";
import { aggregateFlows, alignFlows, buyingStreak, capRatio, cumulativeFlows, rollingFlows, windowSum, type InvestorPoint } from "./investor-flow";
const point = (date: string, value: number | null): InvestorPoint => ({ date, individual: value, foreign: value, institution: value });
describe("investor flow windows", () => {
  it("accumulates signed values per investor and never carries through missing sessions", () => {
    const points: InvestorPoint[] = [
      { date: "2026-01-02", individual: 10, foreign: -3, institution: 0 },
      { date: "2026-01-05", individual: -4, foreign: null, institution: 5 },
      { date: "2026-01-06", individual: 2, foreign: 10, institution: -1 },
    ];
    expect(cumulativeFlows(points)).toEqual([
      { date: "2026-01-02", individual: 10, foreign: -3, institution: 0 },
      { date: "2026-01-05", individual: 6, foreign: null, institution: 5 },
      { date: "2026-01-06", individual: 8, foreign: null, institution: 4 },
    ]);
    expect(cumulativeFlows(points.slice(1))[0].individual).toBe(-4);
  });
  it("keeps missing sessions in windows and never substitutes zero", () => {
    const points = alignFlows([point("2026-10-28", 10), point("2026-10-30", 20)], ["2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(windowSum(points, "foreign", 3)).toBeNull();
    expect(windowSum(points, "foreign", 1)).toBe(20);
    expect(rollingFlows(points, 5).every(p => p.foreign === null)).toBe(true);
  });
  it("sums exactly 5/20/60 trading sessions with signed sales", () => {
    const points = Array.from({ length: 60 }, (_, i) => point(String(i), i % 2 ? 10 : -5));
    expect(windowSum(points, "foreign", 5)).toBe(20);
    expect(windowSum(points, "foreign", 20)).toBe(50);
    expect(windowSum(points, "foreign", 60)).toBe(150);
    expect(windowSum(points.slice(1), "foreign", 60)).toBeNull();
  });
  it("invalidates aggregate on any missing member", () => {
    expect(aggregateFlows([[point("d", 2)], []], ["d"])[0].foreign).toBeNull();
    expect(aggregateFlows([[point("d", 2)], [point("d", 3)]], ["d"])[0].foreign).toBe(5);
  });
  it("stops buying streak on zero/sales and labels truncated streaks", () => {
    expect(buyingStreak([point("1", -1), point("2", 1), point("3", 2)], "individual")).toEqual({ days: 2, atLeast: false });
    expect(buyingStreak([point("1", null), point("2", 1)], "individual")).toEqual({ days: 1, atLeast: true });
    expect(buyingStreak([point("1", null)], "individual")).toBeNull();
    expect(buyingStreak([point("1", 0)], "individual")).toEqual({ days: 0, atLeast: false });
  });
  it("uses won on both sides of the market-cap ratio", () => {
    expect(capRatio(1e8, 1e12)).toBe(0.01);
    expect(capRatio(null, 1e12)).toBeNull();
    expect(capRatio(1, 0)).toBeNull();
  });
});
