import { describe, expect, it } from "vitest";
import { buildStockReturns } from "./publication";
import type { ValuationMarketCaps } from "@/lib/valuation/market-caps";
function snapshot(date: string): ValuationMarketCaps {
  const values: Record<string, number | null> = {}, closes: Record<string, number | null> = {}, securities: NonNullable<ValuationMarketCaps["securities"]> = {};
  for (let i = 0; i < 20; i++) {
    const code = String(i).padStart(6, "0"); values[code] = 1000; closes[code] = 100;
    securities[code] = { name: code, market: i < 10 ? "KOSPI" : "KOSDAQ" };
  }
  return { version: 1, source: "KRX_WEB_VERIFIED", asOf: date, fetchedAt: "2026-11-11T07:00:00Z", exchange: "KRX", priceTime: "15:30 KST", priceBasis: "KRX_REGULAR_CLOSE", values, closes, securities };
}
const bases = { "1d": "2026-11-10", "3d": "2026-11-06", "1w": "2026-11-04", "1m": "2026-10-12", "3m": "2026-08-11", "6m": "2026-05-11", "1y": "2025-11-11" };
describe("KRX stock returns", () => {
  it("uses exact common market dates and leaves missing historical prices null", () => {
    const current = snapshot("2026-11-11"), previous = snapshot("2026-11-10");
    current.closes["000000"] = 120; delete previous.closes["000001"];
    const p = buildStockReturns(current, { "2026-11-10": previous }, bases);
    expect(p.markets.kospi[0].returns["1d"]).toBeCloseTo(20);
    expect(p.markets.kospi[0].returns["3d"]).toBeNull();
    expect(p.markets.kospi[1].returns["1d"]).toBeNull();
    expect(p.markets.kosdaq).toHaveLength(10);
  });
  it("rejects a legacy list without market and names", () => {
    const p = snapshot("2026-11-11"); delete p.securities;
    expect(() => buildStockReturns(p, {}, bases)).toThrow();
  });
});
