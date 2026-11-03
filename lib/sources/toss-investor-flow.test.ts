import { describe, expect, it } from "vitest";
import { parseTossInvestorRecords, parseTossMarketRecords } from "./toss-investor-flow";
describe("토스 투자자별 거래량", () => {
  it("returns signed shares, keeps nulls, sorts dates, and excludes newer sessions", () => {
    const response = { result: { records: [
      { date: "2026-11-03", individual: { netBuyVolume: "9" }, foreigner: null, institution: null },
      { date: "2026-11-02", individual: null, foreigner: { netBuyVolume: "-2" }, institution: { netBuyVolume: "0" } },
      { date: "2026-10-30", individual: { netBuyVolume: "10" }, foreigner: { netBuyVolume: "-5" }, institution: { netBuyVolume: "2" } },
    ] } };
    expect(parseTossInvestorRecords(response, "2026-11-02")).toEqual([
      { date: "2026-10-30", individual: 10, foreign: -5, institution: 2 },
      { date: "2026-11-02", individual: null, foreign: -2, institution: 0 },
    ]);
  });
  it("rejects missing and nonintegral values instead of converting them to zero", () => {
    expect(() => parseTossInvestorRecords({ result: { records: [{ date: "2026-11-02", individual: {}, foreigner: null, institution: null }] } }, "2026-11-02")).toThrow();
  });
});
describe("토스 시장별 매매대금", () => {
  it("calculates signed net amounts from buy minus sell and excludes newer records", () => {
    const group = (buyAmount: string, sellAmount: string) => ({ buyAmount, sellAmount });
    const data = { result: { records: [
      { date: "2026-11-03", updatedAt: "2026-11-03T14:00:00+09:00", individual: group("50", "10"), foreigner: group("0", "0"), institution: group("0", "0") },
      { date: "2026-11-02", updatedAt: "2026-11-02T18:10:00+09:00", individual: group("500000000", "700000000"), foreigner: group("900000000", "500000000"), institution: null },
    ] } };
    expect(parseTossMarketRecords(data, "2026-11-02")).toEqual({ points: [{ date: "2026-11-02", individual: -200000000, foreign: 400000000, institution: null }], latestUpdatedAt: "2026-11-02T18:10:00+09:00" });
  });
  it("rejects invalid amounts and duplicate dates", () => {
    const row = { date: "2026-11-02", individual: { buyAmount: "", sellAmount: "0" }, foreigner: null, institution: null };
    expect(() => parseTossMarketRecords({ result: { records: [row] } }, "2026-11-02")).toThrow();
    expect(() => parseTossMarketRecords({ result: { records: [{ ...row, individual: null }, { ...row, individual: null }] } }, "2026-11-02")).toThrow();
  });
});
