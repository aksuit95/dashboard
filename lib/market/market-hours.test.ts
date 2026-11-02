import { describe, expect, it } from "vitest";
import { daySessions, marketStatus, sessionsForDate, timeText } from "@/lib/market/market-hours";

const status = (market: "krx" | "nxt" | "us", iso: string) => marketStatus(market, Date.parse(iso));

describe("시장 운영시간", () => {
  it("NXT 프리마켓 종료와 메인마켓 30초 지연을 구분한다", () => {
    expect(status("nxt", "2026-11-02T08:49:59+09:00").active[0].label).toBe("프리마켓");
    expect(status("nxt", "2026-11-02T08:50:00+09:00").active).toHaveLength(0);
    expect(status("nxt", "2026-11-02T09:00:29+09:00").active).toHaveLength(0);
    expect(status("nxt", "2026-11-02T09:00:30+09:00").active[0].label).toBe("메인마켓");
  });
  it("종가매매와 새 애프터마켓의 경계를 구분한다", () => {
    expect(status("krx", "2026-11-02T15:25:00+09:00").active[0].label).toBe("종가 동시호가");
    expect(status("krx", "2026-11-02T15:35:00+09:00").active).toHaveLength(0);
    expect(status("nxt", "2026-11-02T15:35:00+09:00").active[0].label).toBe("종가매매");
    expect(status("krx", "2026-11-02T15:40:00+09:00").active[0].label).toBe("장후 시간외종가");
    for (const market of ["krx", "nxt"] as const) {
      expect(status(market, "2026-11-02T16:00:00+09:00").active[0].label).toBe("애프터마켓");
      expect(status(market, "2026-11-02T20:00:00+09:00").active).toHaveLength(0);
    }
  });
  it("미국의 서머타임 전환을 뉴욕 거래일 기준으로 적용한다", () => {
    const summer = sessionsForDate("us", "2026-10-30").find(s => s.phase === "regular")!;
    const winter = sessionsForDate("us", "2026-11-02").find(s => s.phase === "regular")!;
    expect([timeText(summer.start), timeText(summer.end)]).toEqual(["22:30", "05:00"]);
    expect([timeText(winter.start), timeText(winter.end)]).toEqual(["23:30", "06:00"]);
  });
  it("서울 토요일 새벽은 미국 금요일 세션이고 월요일 새벽은 휴장이다", () => {
    expect(status("us", "2026-10-31T06:00:00+09:00").active[0].label).toBe("애프터마켓");
    expect(status("us", "2026-11-02T06:00:00+09:00").active).toHaveLength(0);
    const satStart = Date.parse("2026-10-31T00:00:00+09:00");
    expect(daySessions("2026-10-31").some(s => s.market === "us" && s.start < satStart && s.end > satStart)).toBe(true);
  });
  it("국내 휴일과 미국 휴일을 독립적으로 적용하고 다음 개장을 찾는다", () => {
    expect(status("krx", "2026-10-09T10:00:00+09:00").note).toBe("한글날");
    expect(status("us", "2026-11-26T10:00:00-05:00").note).toBe("Thanksgiving");
    const sunday = status("nxt", "2026-11-01T10:00:00+09:00");
    expect(sunday.next?.start).toBe(Date.parse("2026-11-02T08:00:00+09:00"));
  });
  it("조기폐장과 미확인 특별 일정은 정상 거래로 표시하지 않는다", () => {
    expect(status("us", "2026-11-27T12:59:59-05:00").active[0].phase).toBe("regular");
    expect(status("us", "2026-11-27T13:00:00-05:00").active).toHaveLength(0);
    expect(status("us", "2026-11-27T13:00:00-05:00").uncertain).toBe(true);
    expect(status("krx", "2026-11-19T09:00:00+09:00").uncertain).toBe(true);
    expect(status("krx", "2027-01-04T10:00:00+09:00").uncertain).toBe(true);
  });

  it("오버나이트는 한국 표준시 10–18시, 서머타임 09–17시로 표시한다", () => {
    const summer = sessionsForDate("us", "2026-10-30").find(s => s.phase === "overnight")!;
    const winter = sessionsForDate("us", "2026-11-02").find(s => s.phase === "overnight")!;
    expect([timeText(summer.start), timeText(summer.end)]).toEqual(["09:00", "17:00"]);
    expect([timeText(winter.start), timeText(winter.end)]).toEqual(["10:00", "18:00"]);
    expect(status("us", "2026-11-02T09:59:59+09:00").active).toHaveLength(0);
    expect(status("us", "2026-11-02T10:00:00+09:00").active[0].phase).toBe("overnight");
    expect(status("us", "2026-11-02T18:00:00+09:00").active[0].phase).toBe("pre");
  });

  it("뉴욕 일요일 저녁·월요일 새벽을 동일 오버나이트 세션으로 판정한다", () => {
    const sunday = status("us", "2026-11-01T21:00:00-05:00");
    const monday = status("us", "2026-11-02T01:00:00-05:00");
    expect(sunday.active[0].phase).toBe("overnight");
    expect(sunday.note).toBeNull();
    expect(sunday.active[0].start).toBe(monday.active[0].start);
    expect(status("us", "2026-11-07T12:00:00+09:00").active).toHaveLength(0);
    expect(daySessions("2026-11-02").filter(s => s.phase === "overnight" && s.start >= Date.parse("2026-11-02T00:00:00+09:00"))).toHaveLength(1);
  });

  it("미국 다음 거래일이 휴일이면 오버나이트도 쉬고 다음 영업일 전날 밤에 재개한다", () => {
    expect(status("us", "2026-11-25T21:00:00-05:00").active).toHaveLength(0);
    expect(status("us", "2026-11-26T12:00:00+09:00").active).toHaveLength(0);
    expect(status("us", "2026-11-26T21:00:00-05:00").active[0].phase).toBe("overnight");
    expect(status("us", "2026-11-27T12:00:00+09:00").active[0].phase).toBe("overnight");
  });
});
