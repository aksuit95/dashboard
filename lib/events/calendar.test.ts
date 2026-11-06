import { describe, expect, it } from "vitest";
import { addDays, seoulDate, upcomingEvents, type MarketEvent } from "./calendar";

describe("market event calendar", () => {
  it("uses the Korean date across UTC midnight and year boundaries", () => {
    expect(seoulDate(new Date("2026-12-31T15:01:00Z"))).toBe("2027-01-01");
    expect(addDays("2026-12-20", 27)).toBe("2027-01-16");
  });
  it("includes exactly today and the following 27 days in time order", () => {
    const item = (id: string, date: string, time: string | null): MarketEvent => ({ id, date, time, country: "US", category: "매크로", title: id, detail: "", source: "", sourceName: "" });
    const list = [item("outside", "2026-12-04", "00:00"), item("unknown", "2026-11-06", null), item("first", "2026-11-06", "09:00"), item("last", "2026-12-03", "23:59"), item("past", "2026-11-05", "23:59")];
    expect(upcomingEvents("2026-11-06", list).map(e => e.id)).toEqual(["first", "unknown", "last"]);
  });
});
