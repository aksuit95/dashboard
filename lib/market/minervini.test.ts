import { describe, expect, it } from "vitest";
import { analyzeMinervini, rsRanks, rsScore, screenMinervini, type MinerviniBar } from "./minervini";
import { minerviniSession } from "./minervini-session";

const stock = { code: "005930", name: "테스트 보통주", marketCap: 1e12, tradable: true };
function setup(close = 324, volume = 200_000): MinerviniBar[] {
  const bars = Array.from({ length: 330 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), open: 100 + i * 0.6, high: 102 + i * 0.6, low: 98 + i * 0.6, close: 100 + i * 0.6, volume: 1_000_000 }));
  for (let j = 0; j < 30; j++) {
    const block = Math.floor(j / 10);
    const high = [350, 335, 325][block];
    const low = [270, 295, 310][block];
    Object.assign(bars[299 + j], { open: (high + low) / 2, close: (high + low) / 2, high, low, volume: block === 2 ? 100_000 : 1_000_000 });
  }
  Object.assign(bars[329], { open: close - 1, close, high: close + 1, low: close - 2, volume });
  return bars.map(b => ({ ...b, volume: b.volume * 10 }));
}
describe("미너비니 계산", () => {
  it("RS는 252일 수익률에 253개 종가가 필요하고 동점은 같은 백분위다", () => {
    expect(rsScore(setup().slice(-252))).toBeNull();
    const first = setup()[0];
    const bars = Array.from({ length: 253 }, (_, i) => ({ ...first, close: 100 + i }));
    const expected = 0.4 * (352 / 289 - 1) * 100 + 0.2 * (352 / 226 - 1) * 100 + 0.2 * (352 / 163 - 1) * 100 + 0.2 * (352 / 100 - 1) * 100;
    expect(rsScore(bars)).toBeCloseTo(expected);
    expect([...rsRanks([{ code: "a", score: 1 }, { code: "b", score: 1 }, { code: "c", score: 3 }]).values()]).toEqual([25, 25, 100]);
    expect(rsRanks([{ code: "a", score: 1 }]).get("a")).toBe(50);
  });
  it("VCP·피벗·거래량 평균에서 당일 돌파봉을 제외한다", () => {
    const waiting = analyzeMinervini(stock, setup(), 90);
    const breakout = analyzeMinervini(stock, setup(336, 2_000_000), 90);
    expect(waiting.status).toBe("ready");
    expect(breakout.status).toBe("breakout");
    expect(breakout.pivot).toBe(335);
    expect(breakout.vcp).toBe(true);
    expect(breakout.dryUp).toBe(waiting.dryUp);
    expect(breakout.contractions).toEqual(waiting.contractions);
    expect(breakout.volumeRatio).toBeCloseTo(2_000_000 / 820_000);
    expect(analyzeMinervini(stock, setup(336, 1_000_000), 90).status).toBe("ready");
    expect(analyzeMinervini(stock, setup(355, 2_000_000), 90).status).toBe("extended");
  });
  it("상승 조건은 200일선 끝점 비교가 아닌 매일 상승이어야 한다", () => {
    const bars = setup();
    bars[bars.length - 210].close = 1000;
    const row = analyzeMinervini(stock, bars, 90);
    expect(row.checks[2].pass).toBe(false);
    expect(row.status).toBe("trend");
  });
  it("RS·유동성·정지·단기 이력 필터와 위험 참고값을 적용한다", () => {
    expect(analyzeMinervini(stock, setup(), 69.99).status).toBe("rs");
    expect(analyzeMinervini({ ...stock, marketCap: 1e9 }, setup(), 90).status).toBe("excluded");
    expect(analyzeMinervini({ ...stock, tradable: false }, setup(), 90).status).toBe("excluded");
    expect(analyzeMinervini(stock, setup(324, 0), 90).status).toBe("excluded");
    expect(analyzeMinervini(stock, setup().slice(-200), null).status).toBe("excluded");
    const row = analyzeMinervini(stock, setup(336, 2_000_000), 90);
    expect(row.stop).toBeGreaterThanOrEqual(335 * 0.92);
    expect(row.pivotRisk).toBeCloseTo((1 - row.stop! / 335) * 100);
    expect(row.target! - row.price!).toBeCloseTo(2 * (row.price! - row.stop!));
  });
  it("유동성 제외 이전의 전체 구성종목으로 RS를 계산한다", () => {
    const rows = screenMinervini([{ stock, bars: setup() }, { stock: { ...stock, code: "000660", marketCap: 1 }, bars: setup().map(b => ({ ...b, close: b.close * 0.9 })) }]);
    expect(rows.every(r => r.rs != null)).toBe(true);
    expect(rows.find(r => r.code === "000660")!.status).toBe("excluded");
  });
  it("시장별 RS 유니버스 이름을 표시하고 서로의 종목을 순위에 섞지 않는다", () => {
    const kospi = screenMinervini([{ stock, bars: setup() }, { stock: { ...stock, code: "000660" }, bars: setup(336) }], "kospi200");
    const kosdaq = screenMinervini([{ stock: { ...stock, code: "196170" }, bars: setup() }], "kosdaq150");
    expect(kospi.map(row => row.rs)).toEqual([100, 0]);
    expect(kosdaq[0].rs).toBe(50);
    expect(kosdaq[0].checks[7].label).toBe("코스닥150 내 RS ≥ 70");
  });
});
describe("서울 장 마감 일별 경계", () => {
  it("16:40 전에는 이전 거래일, 이후에는 당일", () => {
    expect(minerviniSession(new Date("2026-11-02T07:39:59Z"))).toBe("2026-10-30");
    expect(minerviniSession(new Date("2026-11-02T07:40:00Z"))).toBe("2026-11-02");
  });
  it("주말·휴일은 이전 거래일, 특별 운영·미검증 연도는 보류", () => {
    expect(minerviniSession(new Date("2026-11-01T08:00:00Z"))).toBe("2026-10-30");
    expect(minerviniSession(new Date("2026-10-09T08:00:00Z"))).toBe("2026-10-08");
    expect(() => minerviniSession(new Date("2026-11-19T08:00:00Z"))).toThrow("특별 운영시간");
    expect(() => minerviniSession(new Date("2027-01-04T08:00:00Z"))).toThrow("캘린더");
  });
});
