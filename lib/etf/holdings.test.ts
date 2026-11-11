import { describe, expect, it } from "vitest";
import { parseKrxHoldings, previousSession, selectComparison, type Publication } from "./holdings";
const rows = ["005930","000660","402340","042700","036930"].map((code, i) => ({ COMPST_ISU_CD: code, COMPST_ISU_NM: `종목${i}`, COMPST_ISU_CU1_SHRS: "1,234.00", COMPST_RTO: "10.50" }));
describe("KRX ETF holdings", () => {
  it("parses units, weights and ISIN, and excludes cash", () => {
    const holdings = parseKrxHoldings({ output: [{...rows[0], COMPST_ISU_CD: "KR7005930003"}, ...rows.slice(1), { COMPST_ISU_CD: "", COMPST_ISU_NM: "현금" }] });
    expect(holdings[0]).toEqual({ code: "005930", name: "종목0", quantity: 1234, weight: 10.5 });
    expect(holdings).toHaveLength(5);
  });
  it("rejects malformed holdings and unknown assets", () => {
    expect(() => parseKrxHoldings({ output: [{ ...rows[0], COMPST_ISU_CU1_SHRS: "-" }, ...rows.slice(1)] })).toThrow();
    expect(() => parseKrxHoldings({ output: [...rows, { COMPST_ISU_CD: "???", COMPST_ISU_NM: "미확인" }] })).toThrow();
  });
  it("only compares the immediately preceding KRX session", () => {
    expect(previousSession("2026-11-09")).toBe("2026-11-06");
    const snapshot = (asOf: string) => ({asOf, source: "KRX_PDF" as const, collectedAt: "2026-11-10T08:00:00Z", holdings: [], market: {}});
    const p: Publication = {version: 1, lastAttempt: null, snapshots: [snapshot("2026-11-05"), snapshot("2026-11-09")]};
    expect(selectComparison(p, "2026-11-09").previous).toBeNull();
    p.snapshots.push(snapshot("2026-11-06"));
    expect(selectComparison(p, "2026-11-09").previous?.asOf).toBe("2026-11-06");
    expect(selectComparison(p, "2026-11-10").stale).toBe(true);
  });
});

import { comparisonDate } from "./holdings";
describe("ETF comparison periods", () => {
  it("uses the previous session, calendar week and calendar month anchors", () => {
    expect(comparisonDate("2026-11-10", "1d")).toBe("2026-11-09");
    expect(comparisonDate("2026-11-10", "1w")).toBe("2026-11-03");
    expect(comparisonDate("2026-11-10", "1m")).toBe("2026-10-08");
  });
  it("clamps month-end dates before adjusting to a session", () => {
    expect(comparisonDate("2026-03-31", "1m")).toBe("2026-02-27");
  });
});


describe("three and six month periods", () => {
  it("uses the corresponding calendar month and preceding session on holidays", () => {
    expect(comparisonDate("2026-11-10", "3m")).toBe("2026-08-10");
    expect(comparisonDate("2026-11-10", "6m")).toBe("2026-05-08");
    expect(comparisonDate("2026-05-31", "3m")).toBe("2026-02-27");
  });
  it("rejects periods beyond the reviewed trading calendar", () => {
    expect(() => comparisonDate("2026-03-31", "6m")).toThrow();
  });
});
