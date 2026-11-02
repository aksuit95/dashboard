import { describe, expect, it } from "vitest";
import { parseValuationSheets, valuationDate, type SourceSheet } from "./parse";

function sheet(name: string, codes: string[], labels: string[], rows: unknown[][], units = codes.map(() => "X")): SourceSheet {
  return { name, rows: [
    ["Code", ...codes.map(() => "IKS200")],
    ["Item Code", ...codes], ["Unit", ...units],
    ["D A T E", ...labels], ...rows,
  ] };
}
const parse = (sheets: SourceSheet[]) => parseValuationSheets(sheets, "코스피200.xlsx", "2026-11-02T06:00:00Z", "2026-11-02");

describe("QuantiWise 밸류에이션 가져오기", () => {
  it("기간이 긴 EPS 시계열을 선택하고 잘못 정렬된 중복 시트를 합치지 않는다", () => {
    const result = parse([
      sheet("EPS원본", ["E312060.M"], ["EPS"], [["2021-11-01", 11007], ["2025-10-31", 15401], ["2026-10-30", 61577]]),
      sheet("혼합", ["E312060.M", "E382160.M"], ["EPS", "P/E"], [["2025-10-31", 11007, 11.29], ["2026-10-30", 11008, 8.5], [null, 61577, null]]),
    ]);
    expect(result.series.find((s) => s.id === "eps")?.sheet).toBe("EPS원본");
    expect(result.series.find((s) => s.id === "per")?.points).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes("동일 날짜"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("날짜가 없는 1행"))).toBe(true);
  });

  it("0과 음수는 보존하고 결측·Excel 오류·미래 날짜는 제외하며 오름차순으로 정렬한다", () => {
    const result = parse([sheet("값", ["E382160.M"], ["PER"], [
      ["2026-10-30", 0], ["2026-10-29", -2], ["2026-11-02", "#N/A"],
      ["2026-11-03", 123], ["2026-02-30", 123], ["2026-10-28", "1,234.5"],
      ["2026-10-27", null], ["2026-10-26", true],
    ])]);
    expect(result.series[0].points).toEqual([{ date: "2026-10-28", value: 1234.5 }, { date: "2026-10-29", value: -2 }, { date: "2026-10-30", value: 0 }]);
  });

  it("영업이익과 FCF의 천원 단위를 억원으로 환산하고 빈 중복 열을 무시한다", () => {
    const result = parse([sheet("금액", ["E121560.M", "E124260.M", "E312060.M"], ["영업이익", "FCF", ""], [["2026-10-30", 366558197709.27, -100000, 100]], ["Local thou", "KRW thou", "Local/Shares"])]);
    expect(result.series[0].points[0].value).toBeCloseTo(3665581.9770927);
    expect(result.series[1].points[0].value).toBeCloseTo(-1);
    expect(result.series).toHaveLength(2);
    expect(result.series[0].unit).toBe("억원");
  });

  it("다른 지수의 데이터와 알 수 없는 단위를 채우지 않는다", () => {
    const other = sheet("다른지수", ["E382160.M"], ["PER"], [["2026-10-30", 10]]);
    other.rows[0][1] = "IKS001";
    expect(() => parse([other])).toThrow("IKS200");
    expect(() => parse([sheet("단위오류", ["E121560.M"], ["영업이익"], [["2026-10-30", 10]], ["unknown"])])).toThrow();
  });

  it("날짜 타입과 8자리 날짜를 지원하며 중복 거래일을 하나로 정리한다", () => {
    expect(valuationDate(new Date("2026-10-30T00:00:00Z"))).toBe("2026-10-30");
    expect(valuationDate(20261030)).toBe("2026-10-30");
    expect(valuationDate("2026.2.30")).toBeNull();
    const result = parse([sheet("중복", ["E382560.M"], ["PBR"], [[20261030, 1.2], ["2026-10-30", 1.3]])]);
    expect(result.series[0].points).toEqual([{ date: "2026-10-30", value: 1.3 }]);
    expect(result.warnings).toHaveLength(1);
  });
});
