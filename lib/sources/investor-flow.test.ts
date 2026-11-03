import { describe, expect, it, vi } from "vitest";
import { fetchEquityFlow, fetchFuturesFlow, krxNumber, parseNearContract, parsePrices, parseStockFlows } from "./investor-flow";
const stockFlow = (date = "2026/11/02") => ({ TRD_DD: date, ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`TRDVAL${i + 1}`, `${i + 1},000`])) });
const caps = Array.from({ length: 200 }, (_, i) => ({ ISU_SRT_CD: String(i).padStart(6, "0"), ISU_ABBRV: `종목${i}`, MKTCAP: `${(i + 1) * 1e10}`, TDD_CLSPRC: "1000" }));
const symbols = caps.map(r => ({ short_code: r.ISU_SRT_CD, full_code: `KR${r.ISU_SRT_CD}` }));
function provider(bld: string) {
  if (bld === "MDCSTAT01501") return { OutBlock_1: caps };
  if (bld === "MDCSTAT00301") return { output: [{ TRD_DD: "2026/11/02", CLSPRC_IDX: "500.1" }] };
  if (bld === "MDCSTAT00601") return { output: caps };
  if (bld.includes("finder_stkisu")) return { block1: symbols };
  if (bld === "MDCSTAT02303") return { output: [stockFlow()] };
  throw new Error(bld);
}
describe("KRX investor source", () => {
  it("maps actual net value fields and rejects blank fields", () => {
    expect(parseStockFlows({ output: [stockFlow()] }, "2026-11-02")[0]).toEqual({ date: "2026-11-02", individual: 9000, foreign: 21000, institution: 28000 });
    expect(() => krxNumber("")).toThrow();
    expect(() => parseStockFlows({ output: [{ ...stockFlow(), TRDVAL11: "-" }] }, "2026-11-02")).toThrow();
    expect(parseStockFlows({ output: [stockFlow("2026/11/03")] }, "2026-11-02")).toEqual([]);
  });
  it("does not accept late combined closing fields for the index", () => {
    expect(() => parsePrices({ output: [{ TRD_DD: "2026/11/02", closingPrice: 500 }] }, "2026-11-02")).toThrow();
    expect(() => parsePrices({ output: [{ TRD_DD: "2026/10/30", CLSPRC_IDX: 500 }] }, "2026-11-02")).toThrow();
  });
  it("selects the reference-date market's largest ten, with won market caps", async () => {
    const query = vi.fn(async (bld: string) => provider(bld));
    const result = await fetchEquityFlow("kospi200", "stocks", "2026-11-02", query);
    expect(result.stocks).toHaveLength(10);
    expect(result.stocks[0].code).toBe("000199");
    expect(result.stocks[0].marketCap).toBe(2e12);
    expect(result.stocks[0].price).toBe(1000);
    expect(query.mock.calls.filter(([bld]) => bld === "MDCSTAT02303")).toHaveLength(10);
  });
  it("index view collects the full membership instead of the ten-stock sample", async () => {
    const result = await fetchEquityFlow("kospi200", "index", "2026-11-02", async bld => provider(bld));
    expect(result.memberCount).toBe(200);
    expect(result.points[0].foreign).toBe(200 * 21000);
  });
  it("isolates a failed member and leaves total missing", async () => {
    const result = await fetchEquityFlow("kospi200", "stocks", "2026-11-02", async (bld, params) => {
      if (params.isuCd2 === "000199") throw new Error("failed member");
      return provider(bld);
    });
    expect(result.collectedCount).toBe(9);
    expect(result.points[0].foreign).toBeNull();
    expect(result.stocks[0].error).toBe("failed member");
  });
  it("chooses nearest listed contract and keeps product totals separate", async () => {
    const contracts = { output: [ { ISU_SRT_CD: "empty", ISU_NM: "코스피200 F 202706", TDD_CLSPRC: "" }, { ISU_SRT_CD: "far", ISU_NM: "코스피200 F 202703", TDD_CLSPRC: "510.1" }, { ISU_SRT_CD: "near", ISU_NM: "코스피200 F 202612", TDD_CLSPRC: "500.1" } ] };
    expect(parseNearContract(contracts, "2026-11-02")?.code).toBe("near");
    expect(() => parseNearContract({ output: [ { ISU_SRT_CD: "near", ISU_NM: "코스피200 F 202612", TDD_CLSPRC: "" }, { ISU_SRT_CD: "far", ISU_NM: "코스피200 F 202703", TDD_CLSPRC: "510.1" } ] }, "2026-11-02")).toThrow();
    const result = await fetchFuturesFlow("kospi200", "2026-11-02", async (bld, params) => {
      if (bld === "MDCSTAT12501") return contracts;
      if (bld === "MDCSTAT00301") return provider(bld);
      expect(params).toMatchObject({ aggBasTpCd: "0", prtType: "QTY", prtCheck: "SUN", isuCd: "KR___FUK2I" });
      return { output: [{ TRD_DD: "2026/11/02", A07: "100", A09: "-200", A12: "110" }] };
    });
    expect(result.scope).toBe("ALL_CONTRACTS");
    expect(result.points[0].individual).toBe(-200);
  });
});
