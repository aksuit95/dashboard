import { describe, expect, it } from "vitest";
import { parseBls, parseIsm, refreshFeed, relevantYears } from "./refresh";

const table = (rows: string) => `<table>${rows}</table>`;
const row = (...cells: string[]) => `<tr>${cells.map(cell => `<td>${cell}</td>`).join("")}</tr>`;
describe("calendar feeds", () => {
  it("converts official BLS times in standard and daylight time", () => {
    const html = table(row("Tuesday, November 10, 2026", "08:30 AM", "Consumer Price Index for October 2026") + row("Friday, July 02, 2026", "08:30 AM", "Employment Situation for June 2026"));
    const events = parseBls(html, 2026);
    expect(events.map(e => [e.date, e.time])).toEqual([["2026-11-10", "22:30"], ["2026-07-02", "21:30"]]);
  });
  it("moves ISM midnight into the next Korean calendar day", () => {
    const events = parseIsm(table(row("December 2026", "1", "3")));
    expect(events.map(e => [e.date, e.time])).toEqual([["2026-12-02", "00:00"], ["2026-12-04", "00:00"]]);
  });
  it("preserves the last successful data if a source changes or fails", async () => {
    const old = {updatedAt:"2026-11-05T07:00:00Z", error:null, events:parseIsm(table(row("December 2026", "1", "3")))};
    const feed = await refreshFeed(old, async () => parseIsm("invalid page"), "2026-11-06T07:00:00Z");
    expect(feed.events).toEqual(old.events);
    expect(feed.updatedAt).toBe(old.updatedAt);
    expect(feed.error).toBeTruthy();
  });
  it("requests both source years across a year boundary", () => {
    expect(relevantYears("2026-12-20")).toEqual([2026, 2027]);
  });
});
