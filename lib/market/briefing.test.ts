import { describe, expect, it } from "vitest";
import { resolvePeriod } from "./briefing";

describe("briefing trading periods", () => {
  it("allows a weekly report immediately after the final close", () => {
    expect(() => resolvePeriod("weekly", "2026-11-13", new Date("2026-11-13T06:29:00Z"))).toThrow("장 마감 전");
    expect(resolvePeriod("weekly", "2026-11-13", new Date("2026-11-13T06:30:00Z"))).toMatchObject({ start: "2026-11-09", end: "2026-11-13", base: "2026-11-06" });
  });
  it("uses Thursday as the final day when Friday is a holiday", () => {
    expect(resolvePeriod("weekly", "2026-10-08", new Date("2026-10-08T06:30:00Z"))).toMatchObject({ start: "2026-10-05", end: "2026-10-08", base: "2026-10-02", days: ["2026-10-06", "2026-10-07", "2026-10-08"] });
  });
  it("resolves a weekend to the prior completed session", () => {
    expect(resolvePeriod("daily", "2026-11-15", new Date("2026-11-15T03:00:00Z"))).toMatchObject({ end: "2026-11-13", base: "2026-11-12" });
  });
  it("refuses unverified hours and calendars", () => {
    expect(resolvePeriod("weekly", "2026-11-20", new Date("2026-11-21T00:00:00Z")).days).toContain("2026-11-19");
    expect(resolvePeriod("daily", "2026-11-19", new Date("2026-11-19T07:29:00Z")).end).toBe("2026-11-18");
    expect(resolvePeriod("daily", "2026-11-19", new Date("2026-11-19T07:30:00Z")).end).toBe("2026-11-19");
    expect(() => resolvePeriod("daily", "2025-11-14", new Date("2026-11-21T00:00:00Z"))).toThrow("캘린더");
  });
});
