import { describe, expect, it, vi } from "vitest";
import { fetchValuationMarketCaps } from "./market-caps";

const row = { BAS_DD: "20261103", ISU_CD: "005930", MKTCAP: "1,000,000,000,000", TDD_CLSPRC: "100,000" };
describe("밸류에이션 KRX 시가총액", () => {
  it("요청 거래일의 KRX 시총을 원 단위로 읽고 가격 결측은 보존한다", async () => {
    const request = vi.fn(async () => [row, { ...row, ISU_CD: "000660", TDD_CLSPRC: "-" }]);
    const result = await fetchValuationMarketCaps("2026-11-03", request);
    expect(request).toHaveBeenCalledWith("sto/stk_bydd_trd", "20261103");
    expect(result).toMatchObject({ asOf: "2026-11-03", exchange: "KRX", priceTime: "15:30 KST", priceBasis: "KRX_REGULAR_CLOSE", values: { "005930": 1e12, "000660": null } });
  });
  it("다른 거래일·중복 종목·빈 결과와 수집 실패는 대체하지 않는다", async () => {
    for (const rows of [[], [{ ...row, BAS_DD: "20261102" }], [row, row]]) {
      await expect(fetchValuationMarketCaps("2026-11-03", async () => rows)).rejects.toThrow();
    }
    await expect(fetchValuationMarketCaps("2026-11-03", async () => { throw new Error("수집 실패"); })).rejects.toThrow("수집 실패");
  });
});
