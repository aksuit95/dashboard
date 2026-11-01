import { describe, expect, it } from "vitest";
import { formatHm, seoulSession, usCashSpan } from "@/lib/market/kr-session";

describe("한국 장 세션", () => {
  it("16:45 는 애프터, 정규장과 NXT 프리마켓을 구분한다", () => {
    expect(seoulSession(new Date("2026-10-30T07:45:00Z")).label).toBe("KR 애프터");
    expect(seoulSession(new Date("2026-10-30T01:00:00Z")).label).toBe("KR 정규");
    expect(seoulSession(new Date("2026-10-30T06:40:00Z")).label).toBe("NXT");
    expect(seoulSession(new Date("2026-10-29T23:30:00Z")).label).toBe("NXT");
    expect(seoulSession(new Date("2026-10-30T12:00:00Z")).label).toBe("휴장");
  });

  it("서울 토요일 오전에도 뉴욕 금요일이면 미국 정규장이다", () => {
    expect(seoulSession(new Date("2026-10-30T14:00:00Z")).label).toBe("US 정규");
    expect(seoulSession(new Date("2026-10-30T19:00:00Z")).label).toBe("US 정규");
    expect(seoulSession(new Date("2026-10-31T03:00:00Z")).label).toBe("휴장");
  });

  it("서머타임과 겨울의 미국장 서울 시각이 한 시간 다르다", () => {
    const summer = usCashSpan(new Date("2026-10-30T07:45:00Z"));
    expect(formatHm(summer.start)).toBe("22:30");
    expect(formatHm(summer.end)).toBe("05:00");
    const winter = usCashSpan(new Date("2026-01-15T07:00:00Z"));
    expect(formatHm(winter.start)).toBe("23:30");
    expect(formatHm(winter.end)).toBe("06:00");
  });
});
