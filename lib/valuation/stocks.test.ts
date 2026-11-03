import { describe, expect, it } from "vitest";
import { parseStockValuation } from "./stocks";
import type { SourceSheet } from "./parse";

function fixture(): SourceSheet {
  return { name: "종목별 밸류에이션", rows: [
    ["Refresh", "Last Update : 2026-11-02 16:33:47"],
    ["Composition Date", "CPD [20261102]"],
    [null, "Account", "E312060.M", "E312080.M", "E121560.M", "E124260.M", "E382160.M"],
    [null, "Unit", "Local/Shares", "Local/Shares", "Local thou", "Local thou", "X"],
    [null, "Base Date", "CPD-1TD", "CPD-1TD", "CPD-1TD", "CPD-1TD", "CPD-1TD"],
    ["Code", "Name", "EPS 지배", "EPS 전체", "영업이익", "FCF", "PER"],
    ["A005930", "삼성전자", 1000, 1100, 100000, -200000, 0],
    ["A000080", "하이트진로", null, { error: "#N/A" }, null, null, -3],
    ["A0123A0", "신규주", 0, "1,234", 0, 0, null],
  ] };
}
const parse = (sheets: SourceSheet[]) => parseStockValuation(sheets, "코스피200.xlsx", "2026-11-02T08:00:00Z");

describe("종목별 Peer Analysis", () => {
  it("가로형 지수 시트와 섞지 않고 지배·전체 EPS, 천원 환산, 결측·음수·0을 보존한다", () => {
    const result = parse([{ name: "지수", rows: [["Code", "IKS200"], ["Item Code", "E382160.M"], ["DATE", "PER"], ["2026-10-30", 15]] }, fixture()]);
    expect(result.stocks).toHaveLength(3);
    expect(result.stocks[0]).toEqual({ code: "005930", name: "삼성전자", values: { eps: 1000, epsTotal: 1100, operatingProfit: 1, fcf: -2, per: 0 } });
    expect(result.stocks[1].values).toEqual({ eps: null, epsTotal: null, operatingProfit: null, fcf: null, per: -3 });
    expect(result.stocks[2].code).toBe("0123A0");
    expect(result.stocks[2].values.epsTotal).toBe(1234);
    expect(result.compositionDate).toBe("2026-11-02");
    expect(result.metrics[0].baseDate).toBe("CPD-1TD");
  });
  it("잘못된 단위·중복 종목·구성일 누락 시 잘못된 JSON 생성을 막는다", () => {
    const unit = fixture(); unit.rows[3][4] = "unknown";
    expect(() => parse([unit])).toThrow("단위");
    const duplicate = fixture(); duplicate.rows.push(duplicate.rows[6]);
    expect(() => parse([duplicate])).toThrow("중복");
    const date = fixture(); date.rows[1][1] = "CPD";
    expect(() => parse([date])).toThrow("구성 기준일");
  });
});
