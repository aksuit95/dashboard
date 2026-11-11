import { describe, expect, it } from "vitest";
import { collectPension, numeric, pensionRow } from "./source";

const filing = { corp_code: "00122737", corp_name: "팬오션", stock_code: "028670", report_nm: "임원ㆍ주요주주특정증권등소유상황보고서", rcept_no: "20261110000069", rcept_dt: "20261110", flr_nm: "국민연금공단" };
describe("국민연금 공시", () => {
  it("matches the same receipt and reporter; maps signed changes without inventing numbers", () => {
    const row = pensionRow(filing, "executive", [{ rcept_no: filing.rcept_no, repror: "국민연금공단", sp_stock_lmp_rate: "9.97", sp_stock_lmp_irds_rate: "-0.08", sp_stock_lmp_irds_cnt: "-400,971", isu_main_shrholdr: "10%이상주주" }]);
    expect(row).toMatchObject({ holding: 9.97, changeRate: -0.08, changeShares: -400971, filedAt: "2026-11-10", detailPending: false });
    expect(numeric("-" )).toBeNull(); expect(numeric(" ")).toBeNull();
    expect(pensionRow(filing, "executive", [{ rcept_no: "20261110000068", repror: "국민연금공단" }])).toMatchObject({ holding: null, changeShares: null, detailPending: true });
  });
  it("finds later pages and filters other reporters", async () => {
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("list.json")) {
        const detail = url.searchParams.get("pblntf_detail_ty"), page = url.searchParams.get("page_no");
        if (detail === "D001") return Response.json({ status: "013" });
        return Response.json({ status: "000", total_page: 2, list: page === "1" ? [{ ...filing, flr_nm: "다른 기관" }] : [filing] });
      }
      return Response.json({ status: "000", list: [{ rcept_no: filing.rcept_no, repror: "국민연금공단", sp_stock_lmp_rate: "9.97" }] });
    };
    const result = await collectPension("2026-11", new Date("2026-11-11T10:00:00+09:00"), fetcher as typeof fetch, "test");
    expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({ id: filing.rcept_no, holding: 9.97, changeShares: null });
  });
  it("surfaces authentication errors rather than publishing an empty month", async () => {
    await expect(collectPension("2026-11", new Date("2026-11-11T10:00:00+09:00"), (async () => Response.json({ status: "010" })) as typeof fetch, "test")).rejects.toThrow("010");
  });
});
