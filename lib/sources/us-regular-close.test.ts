import { describe, expect, it } from "vitest";
import { parseUsRegularClose } from "./us-regular-close";
const meta = {
  symbol: "SKHY", currency: "USD", exchangeTimezoneName: "America/New_York",
  regularMarketPrice: 142.25, regularMarketTime: Date.parse("2026-11-11T21:00:00Z") / 1000,
  postMarketPrice: 999,
  currentTradingPeriod: { regular: { start: Date.parse("2026-11-11T14:30:00Z") / 1000, end: Date.parse("2026-11-11T21:00:00Z") / 1000 } },
};
const body = (value = meta) => ({ chart: { result: [{ meta: value }] } });
describe("completed US regular close metadata", () => {
  it("uses the verified completed regular close when the daily bar is missing", () => {
    expect(parseUsRegularClose(body(), "SKHY", "2026-11-11", new Date("2026-11-12T09:00:00+09:00"))).toEqual({ date: "2026-11-11", close: 142.25 });
  });
  it("rejects an open session, wrong date, symbol, or after-hours timestamp", () => {
    expect(parseUsRegularClose(body(), "SKHY", "2026-11-11", new Date("2026-11-11T20:59:59Z"))).toBeNull();
    expect(parseUsRegularClose(body(), "SKHY", "2026-11-10", new Date("2026-11-12T00:00:00Z"))).toBeNull();
    expect(parseUsRegularClose(body(), "OTHER", "2026-11-11", new Date("2026-11-12T00:00:00Z"))).toBeNull();
    expect(parseUsRegularClose(body({ ...meta, regularMarketTime: meta.regularMarketTime + 3600 }), "SKHY", "2026-11-11", new Date("2026-11-12T00:00:00Z"))).toBeNull();
    expect(parseUsRegularClose(body({ ...meta, regularMarketPrice: NaN }), "SKHY", "2026-11-11", new Date("2026-11-12T00:00:00Z"))).toBeNull();
  });
});
