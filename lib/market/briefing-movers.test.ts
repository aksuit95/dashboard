import { describe, expect, it } from "vitest";
import { summarizeBriefingMovers } from "./briefing-movers";

describe("briefing stock movements", () => {
  const rows = [
    { code: "1", name: "가", sector: "금융", price: 110, returns: { "1d": 10 } },
    { code: "2", name: "나", sector: "금융", price: 90, returns: { "1d": -10 } },
    { code: "3", name: "다", sector: "반도체", price: 100, returns: { "1d": 0 } },
    { code: "4", name: "라", sector: "반도체", price: null, returns: { "1d": null } },
  ];
  it("separates missing from flat and ranks actual rises and falls", () => {
    expect(summarizeBriefingMovers(rows, undefined, false)).toMatchObject({ total: 4, up: 1, down: 1, flat: 1, missing: 1, leaders: [{ code: "1" }], laggards: [{ code: "2" }] });
  });
  it("calculates weekly changes from the matching comparison close", () => {
    const base = rows.slice(0, 3).map(r => ({ ...r, price: 100 }));
    expect(summarizeBriefingMovers(rows, base, true)).toMatchObject({ up: 1, down: 1, flat: 1, missing: 1, leaders: [{ code: "1", value: expect.closeTo(10) }] });
  });
});
