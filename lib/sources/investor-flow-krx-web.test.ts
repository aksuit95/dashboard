import { describe, expect, it, vi } from "vitest";
import { createInvestorKrxWebQuery } from "./investor-flow-krx-web";

const records = () => Array.from({ length: 12 }, (_, i) => ({
  ISU_SRT_CD: `${i}`.padStart(6, "0"), MKT_ID: "STK", TDD_CLSPRC: "1,000",
  LIST_SHRS: `${100 + i}`, MKTCAP: `${(100 + i) * 1000}`,
}));
const params = { trdDd: "20261104", mktId: "STK" };
describe("수급분석 KRX 웹 시세", () => {
  it("checks all-market caps and verifies ten largest closes for the requested day", async () => {
    const query = vi.fn(async () => ({ OutBlock_1: records() }));
    const closes = vi.fn(async (_code: string, date: string) => [{ date, close: 1000 }]);
    const result = await createInvestorKrxWebQuery(query, closes)("MDCSTAT01501", params);
    expect(result.OutBlock_1).toHaveLength(12);
    expect(closes).toHaveBeenCalledTimes(10);
    expect(closes).toHaveBeenCalledWith("000011", "2026-11-04");
    expect(closes).not.toHaveBeenCalledWith("000000", "2026-11-04");
  });
  it("rejects incorrect KRX prices, dates, market caps, and markets", async () => {
    const closes = vi.fn(async () => [{ date: "2026-11-04", close: 999 }]);
    await expect(createInvestorKrxWebQuery(async () => ({ OutBlock_1: records() }), closes)("MDCSTAT01501", params)).rejects.toThrow("교차검증");
    closes.mockResolvedValue([{ date: "2026-11-03", close: 1000 }]);
    await expect(createInvestorKrxWebQuery(async () => ({ OutBlock_1: records() }), closes)("MDCSTAT01501", params)).rejects.toThrow("교차검증");
    const badCap = records(); badCap[0].MKTCAP = "99";
    await expect(createInvestorKrxWebQuery(async () => ({ OutBlock_1: badCap }), closes)("MDCSTAT01501", params)).rejects.toThrow("시총 확인");
    const badMarket = records(); badMarket[0].MKT_ID = "KSQ";
    await expect(createInvestorKrxWebQuery(async () => ({ OutBlock_1: badMarket }), closes)("MDCSTAT01501", params)).rejects.toThrow("시장 확인");
  });
  it("requests the actual KOSPI and KOSDAQ indices without forwarding internal parameters", async () => {
    const query = vi.fn(async () => ({ output: [] }));
    const collect = createInvestorKrxWebQuery(query);
    await collect("MDCSTAT00301", { indIdx: "2", indIdx2: "203", marketIndex: "KOSDAQ", sessionDates: "[]", strtDd: "20251104", endDd: "20261104" });
    expect(query).toHaveBeenCalledWith("MDCSTAT00301", { indIdx: "2", indIdx2: "001", strtDd: "20251104", endDd: "20261104" });
  });
  it("allows an isolated invalid market-cap row for the valuation snapshot only", async () => {
    const data = records(); data[0].MKTCAP = "99";
    const closes = vi.fn(async (_code: string, date: string) => [{ date, close: 1000 }]);
    const query = createInvestorKrxWebQuery(async () => ({ OutBlock_1: data }), closes, { allowInvalidRows: true });
    expect((await query("MDCSTAT01501", params)).OutBlock_1).toHaveLength(12);
    expect(closes).toHaveBeenCalledTimes(10);
  });
});
