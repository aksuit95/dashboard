import { describe, expect, it } from "vitest";
import { classifySector } from "@/config/sectors";
import { calculateReturns, summarizeSectors, returnPeriods, type SectorStock } from "./sector-returns";

describe("섹터별 기간 수익률", () => {
  it("최근 종가와 각 기간 전 종가를 비교하고 경계의 부족 이력을 결측 처리한다", () => {
    const bars = Array.from({ length: 253 }, (_, i) => ({ close: 100 + i }));
    const result = calculateReturns(bars);
    for (const p of returnPeriods) expect(result[p.id]).toBeCloseTo((352 / (352 - p.days) - 1) * 100);
    expect(calculateReturns(bars.slice(1))["1y"]).toBeNull();
    expect(calculateReturns([{ close: 100 }])["1d"]).toBeNull();
    expect(calculateReturns([{ close: 0 }, { close: 100 }])["1d"]).toBeNull();
    expect(calculateReturns([])["1d"]).toBeNull();
  });
  it("섹터를 종목별 단순평균으로 계산하고 결측만 제외하여 유효 종목 수를 제공한다", () => {
    const stock = (code: string, close: number[]): SectorStock => ({ code, name: code, marketCap: 1e12, tradable: true, sector: "반도체", industry: "반도체와반도체장비", price: close.at(-1)!, returns: calculateReturns(close.map(close => ({ close }))) });
    const summary = summarizeSectors([stock("005930", [100, 110]), stock("000660", [100, 100]), stock("000990", [100])]);
    expect(summary.find(s => s.sector === "반도체")).toMatchObject({ count: 3, coverage: { "1d": 2, "1w": 0 }, returns: { "1w": null } });
    expect(summary.find(s => s.sector === "반도체")!.returns["1d"]).toBeCloseTo(5);
    expect(summary.find(s => s.sector === "자동차")!.returns["1d"]).toBeNull();
    expect(summary.reduce((sum, s) => sum + s.count, 0)).toBe(3);
  });
  it("장비·메모리·소재와 테마별 예외를 구분하고 모르는 업종은 미분류로 보존한다", () => {
    expect(classifySector("042700", "반도체와반도체장비")).toBe("반도체장비");
    expect(classifySector("232140", "반도체와반도체장비")).toBe("반도체장비");
    for (const code of ["005930", "080220", "131970", "005290"]) expect(classifySector(code, "반도체와반도체장비")).toBe("반도체");
    expect(classifySector("298380", "생물공학")).toBe("제약/바이오");
    expect(classifySector("140860", "전자장비와기기")).toBe("IT/전자/디스플레이");
    expect(classifySector("058610", "전기제품")).toBe("조선/방산/기계/원전");
    expect(classifySector("043260", "전기제품")).toBe("IT/전자/디스플레이");
    expect(classifySector("373220", "전기제품")).toBe("2차전지");
    expect(classifySector("034020", "기계")).toBe("조선/방산/기계/원전");
    expect(classifySector("214150", "생물공학")).toBe("화장품/미용/유통");
    expect(classifySector("123450", null)).toBe("기타/미분류");
  });
});
