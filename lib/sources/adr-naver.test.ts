import { describe, expect, it } from "vitest";
import { calculateAdr } from "./adr-naver";
describe("네이버 ADR 계산", () => {
  it("20거래일 상승과 하락의 합을 사용하고 결측은 제외한다", () => {
    const dates = Array.from({length: 22}, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    const rising = dates.map((date, i) => ({ date, close: 100 + i }));
    const falling = dates.map((date, i) => ({ date, close: 200 - i }));
    const missing = dates.map((date, i) => ({ date, close: i === 10 ? null : 100 + i }));
    const result = calculateAdr(dates, [rising, falling, missing]);
    expect(result[18].value).toBeNull();
    expect(result[19].value).toBe(190);
    expect(result[19]).toMatchObject({advancers: 2, decliners: 1});
  });
});
