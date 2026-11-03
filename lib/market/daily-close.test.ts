import { describe, expect, it } from "vitest";
import { closeDate, nextCloseDelay, nextUsRefreshDelay, usCloseDate, usRefreshDate } from "@/lib/market/daily-close";

describe("괴리율 일별 종가 갱신", () => {
  it("미국 종가는 서머타임 여부와 무관하게 한국 오전 7시에 반영한다", () => {
    expect(usRefreshDate(new Date("2026-11-03T06:59:59+09:00"))).toBe("2026-10-30");
    expect(usRefreshDate(new Date("2026-11-03T07:00:00+09:00"))).toBe("2026-11-02");
    expect(usRefreshDate(new Date("2026-10-30T06:59:59+09:00"))).toBe("2026-10-28");
    expect(usRefreshDate(new Date("2026-10-30T07:00:00+09:00"))).toBe("2026-10-29");
    expect(usRefreshDate(new Date("2026-11-28T07:00:00+09:00"))).toBe("2026-11-27");
    expect(usRefreshDate(new Date("2026-11-29T07:00:00+09:00"))).toBe("2026-11-27");
  });
  it("다음 갱신은 1분 뒤가 아니라 다음 오전 7시다", () => {
    const now = new Date("2026-11-03T07:00:00+09:00");
    expect(nextUsRefreshDelay(now)).toBe(24 * 60 * 60 * 1000);
    expect(nextUsRefreshDelay(new Date("2026-11-03T06:59:59+09:00"))).toBe(1000);
  });
  it("미국 본장 마감 전에는 직전 종가, 마감부터 당일 종가를 쓴다", () => {
    expect(usCloseDate(new Date("2026-11-03T05:59:59+09:00"))).toBe("2026-10-30");
    expect(usCloseDate(new Date("2026-11-03T06:00:00+09:00"))).toBe("2026-11-02");
    expect(usCloseDate(new Date("2026-10-30T04:59:59+09:00"))).toBe("2026-10-28");
    expect(usCloseDate(new Date("2026-10-30T05:00:00+09:00"))).toBe("2026-10-29");
  });
  it("미국 주말·휴장일과 조기폐장을 반영한다", () => {
    expect(usCloseDate(new Date("2026-11-02T12:00:00+09:00"))).toBe("2026-10-30");
    expect(usCloseDate(new Date("2026-11-27T06:00:00+09:00"))).toBe("2026-11-25");
    expect(usCloseDate(new Date("2026-11-28T02:59:59+09:00"))).toBe("2026-11-25");
    expect(usCloseDate(new Date("2026-11-28T03:00:00+09:00"))).toBe("2026-11-27");
  });
  it("11월 2일 장중에는 10월 30일 종가를 유지하고 16:00에 바꾼다", () => {
    expect(closeDate(new Date("2026-11-02T10:00:00+09:00"))).toBe("2026-10-30");
    expect(closeDate(new Date("2026-11-02T15:59:59+09:00"))).toBe("2026-10-30");
    expect(closeDate(new Date("2026-11-02T16:00:00+09:00"))).toBe("2026-11-02");
    expect(closeDate(new Date("2026-11-01T18:00:00+09:00"))).toBe("2026-10-30");
  });
  it("자정이나 24시간 간격 대신 다음 평일 16:00에 갱신한다", () => {
    const now = new Date("2026-10-30T16:00:00+09:00");
    expect(new Date(now.getTime() + nextCloseDelay(now)).toISOString()).toBe("2026-11-02T07:00:00.000Z");
  });
});
