import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { loadRiskCharts } from "./risk-charts";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("risk charts", () => {
  it("excludes an unfinished US session and calculates the Treasury spread by matching dates", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T19:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const symbol = decodeURIComponent(String(url)).includes("^VIX") ? "^VIX" : "^SOX";
      return Response.json({ chart: { result: [{ meta: { symbol, exchangeTimezoneName: symbol === "^VIX" ? "America/Chicago" : "America/New_York", instrumentType: "INDEX" }, timestamp: [Date.parse("2026-11-06T14:30:00Z") / 1000, Date.parse("2026-11-09T14:30:00Z") / 1000], indicators: { quote: [{ close: [20, 21] }] } }] } });
    }));
    const charts = await loadRiskCharts();
    expect(charts[0].points).toEqual([{ date: "2026-11-06", value: 20 }]);
    expect(charts[1].asOf).toBe("2026-11-06");
    expect(charts[2].points.length).toBeGreaterThan(100);
    expect(charts[2].asOf).toBeTruthy();
  });
});
