import { describe, expect, it, vi } from "vitest";
import { fetchValuationMarketCaps, validateMarketCaps } from "./market-caps";
const rows = (market: string) => Array.from({ length: 10 }, (_, i) => ({ ISU_SRT_CD: `${market === "STK" ? "1" : "2"}${String(i).padStart(5, "0")}`, MKT_ID: market, TDD_CLSPRC: "100", LIST_SHRS: "1000", MKTCAP: "100000" }));
describe("KRX 웹 시가총액", () => {
  it("같은 기준일에 양 시장을 조회하고 종가와 시총을 보존한다", async () => {
    const query = vi.fn(async (_bld: string, p: Record<string, string>) => ({ OutBlock_1: rows(p.mktId) }));
    const data = await fetchValuationMarketCaps("2026-11-03", query);
    expect(data).toMatchObject({ asOf: "2026-11-03", source: "KRX_WEB_VERIFIED", values: { "100000": 100000 }, closes: { "100000": 100 } });
    expect(query).toHaveBeenCalledWith("MDCSTAT01501", { trdDd: "20261103", mktId: "STK" });
    expect(query).toHaveBeenCalledWith("MDCSTAT01501", { trdDd: "20261103", mktId: "KSQ" });
  });
  it("일부 시총 오류는 해당 종목만 결측으로 보존하고 대량 오류는 거부한다", async () => {
    const data = await fetchValuationMarketCaps("2026-11-03", async (_bld, p) => ({ OutBlock_1: rows(p.mktId).map((r, i) => p.mktId === "STK" && i === 0 ? { ...r, MKTCAP: "1" } : r) }));
    expect(data.values["100000"]).toBeNull();
    expect(data.closes["100000"]).toBeNull();
    expect(data.values["100001"]).toBe(100000);
    await expect(fetchValuationMarketCaps("2026-11-03", async (_bld, p) => ({ OutBlock_1: rows(p.mktId).map((r, i) => i < 2 ? { ...r, MKTCAP: "1" } : r) }))).rejects.toThrow("유효 자료 부족");
    expect(() => validateMarketCaps({ priceBasis: "KRX_REGULAR_CLOSE", values: {} })).toThrow();
  });
});
