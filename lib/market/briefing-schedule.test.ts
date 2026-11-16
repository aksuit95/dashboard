import { describe, expect, it } from "vitest";
import { scheduledBriefings } from "./briefing-schedule";
describe("automatic briefing schedule", () => {
  it("waits until 16:00 KST and runs daily after close", () => {
    expect(scheduledBriefings(new Date("2026-11-09T06:59:00Z"))).toEqual([]);
    expect(scheduledBriefings(new Date("2026-11-09T07:00:00Z")).map(x => x.type)).toEqual(["daily"]);
  });
  it("adds weekly on Friday or an earlier last trading day", () => {
    expect(scheduledBriefings(new Date("2026-11-13T07:00:00Z")).map(x => x.type)).toEqual(["daily", "weekly"]);
    expect(scheduledBriefings(new Date("2026-10-08T07:00:00Z")).map(x => x.type)).toEqual(["daily", "weekly"]);
  });
  it("does not create on weekends and never assumes unknown sessions", () => {
    expect(scheduledBriefings(new Date("2026-11-14T07:00:00Z"))).toEqual([]);
    expect(scheduledBriefings(new Date("2026-11-18T07:00:00Z")).map(x => x.type)).toEqual(["daily"]);
    expect(() => scheduledBriefings(new Date("2026-11-19T07:00:00Z"))).toThrow();
  });
});
