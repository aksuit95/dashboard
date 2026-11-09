import { describe, expect, it } from "vitest";
import { alignIndicator, downsampleAligned, downsampleIndicator, indicatorChange, normalizeIndicator, selectIndicatorRange, validateIndicatorPoints } from "./indicator-chart";
describe("시장 지표 차트 데이터", () => {
  it("잘못된 날짜와 중복·역순 또는 비숫자 값을 거절한다", () => {
    for (const rows of [[{date:"2026-02-30",value:1}], [{date:"2026-01-01",value:1},{date:"2026-01-01",value:2}], [{date:"2026-01-01",value:"3"}]]) expect(() => validateIndicatorPoints(rows)).toThrow();
  });
  it("기준일에서 선택 기간만 남긴다", () => {
    const points = [{date:"2026-01-01",value:1},{date:"2026-03-27",value:2},{date:"2026-04-01",value:3}];
    expect(selectIndicatorRange(points,"1W","2026-04-01").map(p=>p.value)).toEqual([2,3]);
  });
  it("긴 데이터의 양 끝과 극값을 보존한다", () => {
    const points=Array.from({length:1000},(_,i)=>({date:String(i).padStart(4,"0"),value:i===501 ? 5000 : i}));
    const result=downsampleIndicator(points,100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result[0]).toEqual(points[0]); expect(result.at(-1)).toEqual(points.at(-1)); expect(result).toContainEqual(points[501]);
  });
  it("지수는 100에서 시작하고 금리와 ADR은 절대 차이로 계산한다", () => {
    const points=[{date:"2026-01-01",value:4.23},{date:"2026-01-02",value:4.35}];
    expect(normalizeIndicator(points,"return")[0].value).toBe(100);
    expect(normalizeIndicator(points,"absolute")[1].value).toBeCloseTo(0.12);
    expect(indicatorChange(4.35,4.23,"absolute","bp")).toBe("+12bp");
    expect(indicatorChange(80,100,"absolute","pp")).toBe("-20.00%p");
    expect(() => normalizeIndicator([{date:"2026-01-01",value:0}],"return")).toThrow();
  });
  it("확인된 휴장일만 이전 값을 채우고 결측이나 관측 범위 밖은 채우지 않는다", () => {
    const points = [{date:"2026-11-06",value:100},{date:"2026-11-10",value:110},{date:"2026-11-12",value:120}];
    const dates = ["2026-11-05","2026-11-06","2026-11-07","2026-11-08","2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13"];
    const aligned = alignIndicator(points, dates, new Set(["2026-11-09"]));
    expect(aligned[0].value).toBeNull();
    expect(aligned[3]).toEqual({date:"2026-11-08",value:100,sourceDate:"2026-11-06"});
    expect(aligned[4].value).toBe(100);
    expect(aligned[6].value).toBeNull();
    expect(aligned[8].value).toBeNull();
    expect(alignIndicator(points,dates,new Set())[4].value).toBeNull();
  });
  it("다운샘플링에도 명시적 결측을 유지한다", () => {
    const points=Array.from({length:1000},(_,i)=>({date:String(i).padStart(4,"0"),value:i===500 ? null : i,sourceDate:i===500 ? null : String(i).padStart(4,"0")}));
    expect(downsampleAligned(points,100).some(p=>p.date === "0500" && p.value === null)).toBe(true);
  });
  it("마지막 실제 값 이후에도 확인된 휴장일만 유지하고 누락 거래일 뒤에는 유지하지 않는다", () => {
    const dates=["2026-11-06","2026-11-07","2026-11-08","2026-11-09","2026-11-10","2026-11-14"];
    const points=[{date:"2026-11-06",value:100}];
    const result=alignIndicator(points,dates,new Set(["2026-11-09"]));
    expect(result[3].sourceDate).toBe("2026-11-06");
    expect(result[4].value).toBeNull();
    expect(result[5].value).toBeNull();
  });
});
