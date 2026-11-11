import { describe, expect, it } from "vitest";
import { commonChanges } from "./common";
import type { Snapshot } from "./holdings";
const snap = (asOf: string, values: [string, number][]): Snapshot => ({asOf, collectedAt: "2026-11-11T00:00:00Z", source: "KRX_PDF", market: {}, holdings: values.map(([code, quantity]) => ({code,name: code,quantity,weight: 1}))});
describe("common ETF changes", () => {
  it("requires two same-direction funds and keeps opposite directions separate", () => {
    const result = commonChanges([
      {etfCode:"396500",before:snap("2026-11-09", [["005930",10],["000660",20]]),after:snap("2026-11-10", [["005930",12],["000660",10]])},
      {etfCode:"0167A0",before:snap("2026-11-09", [["005930",4],["000660",10]]),after:snap("2026-11-10", [["005930",5],["000660",8]])},
      {etfCode:"395160",before:snap("2026-11-09", [["005930",10]]),after:snap("2026-11-10", [["005930",9]])},
    ]);
    expect(result.increase.map(x=>x.code)).toEqual(["005930"]);
    expect(result.increase[0].entries).toHaveLength(2);
    expect(result.decrease.map(x=>x.code)).toEqual(["000660"]);
  });
  it("does not report a single fund or unchanged quantity", () => {
    const before = snap("2026-11-09", [["005930",10]]), after = snap("2026-11-10", [["005930",11]]);
    expect(commonChanges([{etfCode:"396500",before,after}])).toEqual({increase:[],decrease:[]});
  });
});
