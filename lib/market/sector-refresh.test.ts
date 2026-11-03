import { describe, expect, it } from "vitest";
import { nextSectorRefreshAt } from "./sector-refresh";

describe("섹터 화면 하루 한 번 갱신 시각", () => {
  it("16시 직전은 당일, 16시 이후는 다음 거래일을 예약한다", () => {
    expect(nextSectorRefreshAt(new Date("2026-11-03T06:59:59Z"))?.toISOString()).toBe("2026-11-03T07:00:00.000Z");
    expect(nextSectorRefreshAt(new Date("2026-11-03T07:00:00Z"))?.toISOString()).toBe("2026-11-04T07:00:00.000Z");
    expect(nextSectorRefreshAt(new Date("2026-11-03T12:00:00Z"))?.toISOString()).toBe("2026-11-04T07:00:00.000Z");
  });
  it("금요일 이후 주말과 휴장일을 건너뛴다", () => {
    expect(nextSectorRefreshAt(new Date("2026-10-30T07:00:00Z"))?.toISOString()).toBe("2026-11-02T07:00:00.000Z");
    expect(nextSectorRefreshAt(new Date("2026-10-08T07:00:00Z"))?.toISOString()).toBe("2026-10-12T07:00:00.000Z");
  });
  it("특별 운영시간 미확인일과 미등록 연도에는 임의 갱신을 예약하지 않는다", () => {
    expect(nextSectorRefreshAt(new Date("2026-11-18T07:00:00Z"))?.toISOString()).toBe("2026-11-20T07:00:00.000Z");
    expect(nextSectorRefreshAt(new Date("2026-12-30T07:00:00Z"))).toBeNull();
  });
});
