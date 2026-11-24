import { describe, expect, it } from "vitest";
import { scheduledBriefings } from "./briefing-schedule";
describe("automatic briefing schedule", () => {
  it("waits until 16:00 KST for daily reports while checking the last completed week", () => {
    expect(scheduledBriefings(new Date("2026-11-09T06:59:00Z")).map(x => [x.type, x.period.end])).toEqual([["daily", "2026-11-06"], ["weekly", "2026-11-06"]]);
    expect(scheduledBriefings(new Date("2026-11-09T07:00:00Z")).map(x => [x.type, x.period.end])).toEqual([["daily", "2026-11-09"], ["daily", "2026-11-06"], ["weekly", "2026-11-06"]]);
  });
  it("adds weekly on Friday or an earlier last trading day", () => {
    expect(scheduledBriefings(new Date("2026-11-13T07:00:00Z")).find(x => x.type === "weekly")?.period.end).toBe("2026-11-13");
    expect(scheduledBriefings(new Date("2026-10-08T07:00:00Z")).find(x => x.type === "weekly")?.period.end).toBe("2026-10-08");
  });
  it("retries the latest finished session and week after the calendar date changes", () => {
    expect(scheduledBriefings(new Date("2026-11-24T08:00:00+09:00"))).toMatchObject([
      { type: "daily", period: { end: "2026-11-23", base: "2026-11-20" } },
      { type: "weekly", period: { end: "2026-11-20", base: "2026-11-13" } },
    ]);
    expect(scheduledBriefings(new Date("2026-11-24T16:00:00+09:00")).map(x => x.period.end))
      .toEqual(["2026-11-24", "2026-11-23", "2026-11-20"]);
    for (const at of ["2026-11-21T01:04:00+09:00", "2026-11-24T07:00:00+09:00"]) {
      expect(scheduledBriefings(new Date(at)).find(item => item.type === "weekly"))
        .toMatchObject({ period: { end: "2026-11-20", base: "2026-11-13" } });
    }
  });
  it("keeps the regular-session timing on the 16:30 close date", () => {
    expect(scheduledBriefings(new Date("2026-11-18T07:00:00Z")).map(x => [x.type, x.period.end])).toEqual([["daily", "2026-11-18"], ["daily", "2026-11-17"], ["weekly", "2026-11-13"]]);
    expect(scheduledBriefings(new Date("2026-11-19T07:00:00Z")).find(x => x.type === "daily")?.period.end).toBe("2026-11-18");
    expect(scheduledBriefings(new Date("2026-11-19T07:30:00Z")).find(x => x.type === "daily")?.period.end).toBe("2026-11-19");
  });
});
