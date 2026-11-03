import { describe, expect, it } from "vitest";
import { resolveSectorDate, sectorDateRange } from "./sector-date";

const now = new Date("2026-11-03T01:00:00Z");
describe("섹터 조회 날짜", () => {
  it("마지막 완료 거래일까지 최근 30일을 허용하고 주말·휴일은 직전 거래일로 해석한다", () => {
    expect(sectorDateRange(now)).toEqual({ latestDate: "2026-11-02", earliestDate: "2026-10-04" });
    expect(resolveSectorDate("2026-11-02", now)).toBe("2026-11-02");
    expect(resolveSectorDate("2026-11-01", now)).toBe("2026-10-30");
    expect(resolveSectorDate("2026-10-30", now)).toBe("2026-10-30");
    expect(resolveSectorDate("2026-10-09", now)).toBe("2026-10-08");
  });
  it("잘못된 날짜·미래일·조회 범위 밖을 거절한다", () => {
    for (const date of ["2026-11-03", "2026-10-03", "2026-10-32", "2026-11-1", "invalid"]) expect(() => resolveSectorDate(date, now)).toThrow();
    expect(sectorDateRange(new Date("2026-11-03T07:00:00Z")).latestDate).toBe("2026-11-03");
  });
});
