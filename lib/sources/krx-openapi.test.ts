import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { createOpenApiQuery, openApiSessions, requestKrxOpenApi } from "./krx-openapi";

afterEach(() => vi.unstubAllEnvs());
describe("KRX official Open API", () => {
  it("excludes restored Constitution Day from historical collection", () => {
    expect(openApiSessions("20260716", "20260720")).toEqual(["20260716", "20260720"]);
  });
  it("sends the key only in AUTH_KEY and checks exact reference date", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    const fetcher = vi.fn(async (url, init) => {
      expect(String(url)).toBe("https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=20261102");
      expect(String(url)).not.toContain("test-private-key");
      expect(init?.headers).toMatchObject({ AUTH_KEY: "test-private-key" });
      return Response.json({ OutBlock_1: [{ BAS_DD: "20261102", ISU_CD: "005930" }] });
    }) as unknown as typeof fetch;
    expect(await requestKrxOpenApi("sto/stk_bydd_trd", "20261102", fetcher)).toHaveLength(1);
    await expect(requestKrxOpenApi("sto/stk_bydd_trd", "20261103", async () => Response.json({ OutBlock_1: [{ BAS_DD: "20261102" }] }))).rejects.toThrow("기준일 불일치");
  });
  it("explains individual approval on 401 and never returns raw response or secrets", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    await expect(requestKrxOpenApi("idx/kospi_dd_trd", "20261102", async () => new Response("test-private-key", { status: 401 }))).rejects.toThrow("개별 이용 승인");
  });
  it("does not cache authorization failures or fall back to web login for quotes", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    const db = openDatabase(":memory:");
    try {
      const web = vi.fn();
      const fetcher = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
      const query = createOpenApiQuery(db, web, fetcher);
      for (let i = 0; i < 2; i++) await expect(query("MDCSTAT01501", { mktId: "STK", trdDd: "20261102" })).rejects.toThrow("401");
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(web).not.toHaveBeenCalled();
      expect(db.prepare("SELECT COUNT(*) AS n FROM krx_openapi_daily").get()).toMatchObject({ n: 0 });
    } finally { db.close(); }
  });
  it("adapts and reuses successful daily stock quotes with original won market cap", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    const db = openDatabase(":memory:");
    try {
      const fetcher = vi.fn(async () => Response.json({ OutBlock_1: [{ BAS_DD: "20261102", ISU_CD: "005930", ISU_NM: "삼성전자", TDD_CLSPRC: "100000", MKTCAP: "1000000000000" }] })) as unknown as typeof fetch;
      const query = createOpenApiQuery(db, vi.fn(), fetcher);
      const params = { mktId: "STK", trdDd: "20261102" };
      const result = await query("MDCSTAT01501", params);
      expect(result.OutBlock_1).toEqual([expect.objectContaining({ ISU_SRT_CD: "005930", ISU_ABBRV: "삼성전자", MKTCAP: "1000000000000" })]);
      await query("MDCSTAT01501", params);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { db.close(); }
  });
  it("selects exact index name instead of a leveraged variant", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    const db = openDatabase(":memory:");
    try {
      const query = createOpenApiQuery(db, vi.fn(), async () => Response.json({ OutBlock_1: [{ BAS_DD: "20261102", IDX_NM: "코스피 200 레버리지", CLSPRC_IDX: "9999" }, { BAS_DD: "20261102", IDX_NM: "코스피 200", CLSPRC_IDX: "500" }] }));
      const result = await query("MDCSTAT00301", { indIdx: "1", indIdx2: "028", strtDd: "20261102", endDd: "20261102" });
      expect(result.output).toEqual([expect.objectContaining({ TRD_DD: "2026-11-02", CLSPRC_IDX: "500" })]);
    } finally { db.close(); }
  });
  it("fetches explicitly supplied exchange sessions across years and rejects duplicates", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    const db = openDatabase(":memory:");
    try {
      const fetcher = vi.fn(async (url: string | URL | Request) => {
        const date = new URL(String(url)).searchParams.get("basDd");
        return Response.json({ OutBlock_1: [{ BAS_DD: date, IDX_NM: "코스피 200", CLSPRC_IDX: "500" }] });
      }) as unknown as typeof fetch;
      const query = createOpenApiQuery(db, vi.fn(), fetcher);
      const params = { indIdx: "1", indIdx2: "028", strtDd: "20251103", endDd: "20261102" };
      const result = await query("MDCSTAT00301", { ...params, sessionDates: JSON.stringify(["20251103", "20261102"]) });
      expect(result.output).toEqual([expect.objectContaining({ TRD_DD: "2025-11-03" }), expect.objectContaining({ TRD_DD: "2026-11-02" })]);
      await expect(query("MDCSTAT00301", { ...params, sessionDates: JSON.stringify(["20251103", "20251103"]) })).rejects.toThrow("거래일 목록 오류");
    } finally { db.close(); }
  });
  it("selects the market-wide KOSPI and KOSDAQ instead of the 200 and 150 indexes", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    const db = openDatabase(":memory:");
    try {
      const query = createOpenApiQuery(db, vi.fn(), async url => {
        const kospi = String(url).includes("kospi_dd_trd");
        return Response.json({ OutBlock_1: kospi ? [
          { BAS_DD: "20261102", IDX_NM: "코스피 (외국주포함)", CLSPRC_IDX: "" },
          { BAS_DD: "20261102", IDX_NM: "코스피", CLSPRC_IDX: "5859.08" },
          { BAS_DD: "20261102", IDX_NM: "코스피 200", CLSPRC_IDX: "920.63" },
        ] : [
          { BAS_DD: "20261102", IDX_NM: "코스닥", CLSPRC_IDX: "734.36" },
          { BAS_DD: "20261102", IDX_NM: "코스닥 150", CLSPRC_IDX: "1223.93" },
        ] });
      });
      for (const [marketIndex, expected] of [["KOSPI", "5859.08"], ["KOSDAQ", "734.36"]]) {
        const result = await query("MDCSTAT00301", { marketIndex, strtDd: "20261102", endDd: "20261102", sessionDates: '["20261102"]' });
        expect(result.output).toEqual([expect.objectContaining({ CLSPRC_IDX: expected })]);
      }
    } finally { db.close(); }
  });
  it("excludes night and mini futures and keeps investor statistics on the web provider", async () => {
    vi.stubEnv("KRX_API_KEY", "test-private-key");
    const db = openDatabase(":memory:");
    try {
      const web = vi.fn(async () => ({ output: [] }));
      const query = createOpenApiQuery(db, web, async () => Response.json({ OutBlock_1: [
        { BAS_DD: "20261102", PROD_NM: "코스피200 선물", MKT_NM: "야간", ISU_CD: "night" },
        { BAS_DD: "20261102", PROD_NM: "미니코스피200 선물", MKT_NM: "정규", ISU_CD: "mini" },
        { BAS_DD: "20261102", PROD_NM: "코스피200 선물", MKT_NM: "정규", ISU_CD: "day" },
      ] }));
      expect((await query("MDCSTAT12501", { prodId: "KR___FUK2I", aggBasTpCd: "0", trdDd: "20261102" })).output).toEqual([expect.objectContaining({ ISU_SRT_CD: "day" })]);
      await query("MDCSTAT02303", { isuCd: "stock" });
      expect(web).toHaveBeenCalledWith("MDCSTAT02303", { isuCd: "stock" });
    } finally { db.close(); }
  });
});
