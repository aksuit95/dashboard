import { describe, expect, it } from "vitest";
import { risingStreak, buildRisingBoard } from "./rising";
import type { SectorSnapshot } from "@/lib/sources/sector-returns";

describe("연속 상승", () => {
  it("최신 거래일부터 상승을 세고 보합과 하락에서 멈춘다", () => {
    expect(risingStreak([1, 2, 0, 5])).toEqual({ count: 2, incomplete: false });
    expect(risingStreak([-1, 2])).toEqual({ count: 0, incomplete: false });
  });
  it("결측이나 이력 끝은 확정된 연속일수가 아닌 하한으로 표시한다", () => {
    expect(risingStreak([1, null, 2])).toEqual({ count: 1, incomplete: true });
    expect(risingStreak([1, 2, 3])).toEqual({ count: 3, incomplete: true });
    expect(risingStreak([null])).toEqual({ count: 0, incomplete: true });
  });
  it("섹터는 구성 종목 결측 시 평균을 계산하지 않는다", () => {
    const row = (code: string, day: number | null) => ({ code, name: code, sector: "반도체", price: 100, returns: { "1d": day, "1w": 3 } });
    const snapshot = (rows: unknown[]) => ({ rows }) as SectorSnapshot;
    const data = buildRisingBoard([snapshot([row("a", 2), row("b", 4)]), snapshot([row("a", 1), row("b", null)])]);
    const sector = data.sectors.find(s => s.sector === "반도체")!;
    expect(sector.daily).toBe(3);
    expect(sector.streak).toEqual({ count: 1, incomplete: true });
    expect(sector.breadth).toBe(100);
  });
});
