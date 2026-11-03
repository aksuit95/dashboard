import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/db/client";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { loadRiskIndicators } from "./risk-indicators";

afterEach(() => vi.unstubAllGlobals());
const payload = (price: number) => ({ chart: { result: [{
  meta: { regularMarketPrice: price, chartPreviousClose: price - 1, regularMarketTime: 1793664000, gmtoffset: 32400 },
  timestamp: Array.from({ length: 60 }, (_, i) => 1780000000 + i * 86400),
  indicators: { quote: [{ close: Array.from({ length: 60 }, (_, i) => 100 + i) }] },
}] } });

describe("Vercel risk indicators", () => {
  it("populates every indicator on a fresh empty database without a local ingestion job", async () => {
    const db = openDatabase(":memory:");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(payload(url.includes("2YY") ? 3 : url.includes("TNX") ? 4 : 100))));
    try {
      const data = await loadRiskIndicators(db);
      expect(data.errors).toEqual([]);
      expect(data.disparity.every(item => item.latest25 != null && item.latest50 != null && item.series50.length === 11)).toBe(true);
      expect(data.vix?.session).not.toBe("missing");
      expect(data.sox?.session).not.toBe("missing");
      expect(data.spread).toMatchObject({ ten: 4, two: 3, value: 1 });
    } finally { db.close(); }
  });
  it("keeps successful indicators visible when one provider request fails, and preserves saved values", async () => {
    const db = openDatabase(":memory:");
    const fetchMock = vi.fn(async () => Response.json(payload(100)));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await loadRiskIndicators(db);
      fetchMock.mockImplementation(async (url?: unknown) => String(url).includes("VIX") ? new Response("unavailable", { status: 503 }) : Response.json(payload(101)));
      const data = await loadRiskIndicators(db);
      expect(data.errors).toHaveLength(1);
      expect(data.vix?.stale).toBe(true);
      expect(data.vix?.primary).not.toBe("데이터 없음");
      expect(data.sox?.stale).toBe(false);
      expect(data.disparity[0].series50).toHaveLength(11);
    } finally { db.close(); }
  });
});
