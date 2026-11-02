import { describe, expect, it } from "vitest";
import { closeDate, nextCloseDelay } from "@/lib/market/daily-close";

describe("괴리율 일별 종가 갱신", () => {
  it("11월 2일 장중에는 10월 30일 종가를 유지하고 15:30에 바꾼다", () => {
    expect(closeDate(new Date("2026-11-02T10:00:00+09:00"))).toBe("2026-10-30");
    expect(closeDate(new Date("2026-11-02T15:29:59+09:00"))).toBe("2026-10-30");
    expect(closeDate(new Date("2026-11-02T15:30:00+09:00"))).toBe("2026-11-02");
    expect(closeDate(new Date("2026-11-01T18:00:00+09:00"))).toBe("2026-10-30");
  });
  it("자정이나 24시간 간격 대신 다음 평일 15:30에 갱신한다", () => {
    const now = new Date("2026-10-30T16:00:00+09:00");
    expect(new Date(now.getTime() + nextCloseDelay(now)).toISOString()).toBe("2026-11-02T06:30:00.000Z");
  });
});
