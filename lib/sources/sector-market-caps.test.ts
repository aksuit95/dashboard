import { describe, expect, it } from "vitest";
import { matchingCaps, parseSectorCaps } from "./sector-market-caps";
const rows = Array.from({length: 10}, (_, i) => ({ ISU_SRT_CD: String(i).padStart(6, "0"), MKT_ID: "STK", TDD_CLSPRC: "100", MKTCAP: "1,000", LIST_SHRS: "10" }));
describe("KRX 시가총액", () => {
  it("종가·상장주식수와 시총을 검증하고 같은 날 같은 종가만 연결한다", () => {
    const parsed = parseSectorCaps({OutBlock_1: rows}, "STK");
    expect(matchingCaps([{code: "000000", price: 100}, {code: "000001", price: 101}], parsed)).toEqual({"000000": 1000});
    expect(() => parseSectorCaps({OutBlock_1: rows.map(r => ({...r, MKT_ID: "KSQ"}))}, "STK")).toThrow();
    expect(() => parseSectorCaps({OutBlock_1: rows.map(r => ({...r, MKTCAP: "999"}))}, "STK")).toThrow();
  });
});
