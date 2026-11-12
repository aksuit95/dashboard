import { describe, expect, it } from "vitest";
import { parseMarketTurnover } from "./market-turnover";
describe("KRX 시장 거래대금", () => {
  it("sorts regular-market daily won amounts and excludes future dates", () => {
    expect(parseMarketTurnover({ output: [{ TRD_DD: "2026/11/11", ACC_TRDVAL: "1,500,000" }, { TRD_DD: "2026/11/10", ACC_TRDVAL: "2,000" }, { TRD_DD: "2026/11/12", ACC_TRDVAL: "99" }] }, "2026-11-11"))
      .toEqual([{ date: "2026-11-10", value: 2000 }, { date: "2026-11-11", value: 1500000 }]);
  });
  it("rejects missing, negative, duplicated and stale data", () => {
    expect(() => parseMarketTurnover({ output: [{ TRD_DD: "2026/11/11", ACC_TRDVAL: "-" }] }, "2026-11-11")).toThrow();
    expect(() => parseMarketTurnover({ output: [{ TRD_DD: "2026/11/10", ACC_TRDVAL: "10" }] }, "2026-11-11")).toThrow();
    expect(() => parseMarketTurnover({ output: [{ TRD_DD: "2026/11/11", ACC_TRDVAL: "10" }, { TRD_DD: "2026/11/11", ACC_TRDVAL: "10" }] }, "2026-11-11")).toThrow();
  });
});
