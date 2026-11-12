import { describe, expect, it } from "vitest";
import { parseIndexHistory } from "./sector-index";
const sessions = ["2026-11-09", "2026-11-10", "2026-11-11"];
const row = (date: string, close: string) => ({ TRD_DD: date, CLSPRC_IDX: close });
describe("KRX 지수 일간 등락률", () => {
  it("공통 전 거래일 종가로 계산한다", () => {
    const p = parseIndexHistory({ output: [row("2026/11/11", "1,100.00"), row("2026/11/10", "1,000.00")] }, "2026-11-11", sessions);
    expect(p["2026-11-11"].change).toBeCloseTo(10);
    expect(p["2026-11-11"].previousDate).toBe("2026-11-10");
  });
  it("중간 거래일이 빠지면 다른 날짜로 대체하지 않는다", () => {
    const p = parseIndexHistory({ output: [row("2026/11/11", "1100"), row("2026/11/09", "1000")] }, "2026-11-11", sessions);
    expect(p["2026-11-11"]).toBeUndefined();
  });
  it("최신 종가 누락과 중복일을 거절한다", () => {
    expect(() => parseIndexHistory({ output: [row("2026/11/10", "1100"), row("2026/11/09", "1000")] }, "2026-11-11", sessions)).toThrow();
    expect(() => parseIndexHistory({ output: [row("2026/11/11", "1100"), row("2026/11/11", "1000")] }, "2026-11-11", sessions)).toThrow();
  });
});
