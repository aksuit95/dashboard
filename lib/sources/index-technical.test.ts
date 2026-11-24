import { describe, expect, it } from "vitest";
import { calculateIndexTechnical, summarizeIndexTrend } from "@/lib/market/index-technical";
import { parseIndexBars, type IndexBar } from "./index-bars";
import { indexAdr, loadIndexTechnical, readIndexTechnicalHistory } from "./index-technical";

const through = "2026-11-20";
const meta = { status: "ok", source: "KRX 정보데이터시스템", basis: "KRX 정규장 15:30 KST", asOf: through, fetchedAt: `${through}T07:00:00Z` };
const points = [
  { date: "2026-11-13", value: 100 }, { date: "2026-11-16", value: 102 },
  { date: "2026-11-17", value: 104 }, { date: "2026-11-18", value: 106 },
  { date: "2026-11-19", value: 999 }, { date: through, value: 108 },
];

describe("지수 기술적 분석", () => {
  const makeSessions = (length: number, value: (i: number) => number) => Array.from({ length }, (_, i) => {
    const date = new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10);
    const close = value(i);
    const bar: IndexBar = { date, open: close, high: close + 1, low: close - 1, close, volume: 1000 };
    return { date, close, bar, regular1530: true };
  });

  it("이동평균과 등락률, Wilder 지표 및 모멘텀을 계산한다", () => {
    const sessions = makeSessions(201, i => i + 100);
    const data = calculateIndexTechnical(sessions)!;
    expect(data.latest.averages).toEqual({ 5: 298, 20: 290.5, 50: 275.5, 60: 270.5, 120: 240.5, 200: 200.5 });
    expect(data.disparities[0].value).toBeCloseTo(300 / 290.5 * 100);
    expect(data.returns[2]).toBeCloseTo((300 / 280 - 1) * 100);
    expect(data.latest.rsi).toBe(100);
    expect(data.latest.adx).toBeCloseTo(100);
    expect(data.latest.atr).toBeCloseTo(2);
    expect(data.latest.stochastic.k).toBeCloseTo(14 / 15 * 100);
    expect(data.latest.macd?.histogram).toBeCloseTo(0);
    expect(data.points[13].rsi).toBeNull();
    expect(summarizeIndexTrend(data.latest, 60).status).toBe("강세");
  });

  it("현재 관측을 백분위 분포에서 제외하고 스퀴즈 기준을 과거에서 계산한다", () => {
    const data = calculateIndexTechnical(makeSessions(500, i => i === 499 ? 120 : 100))!;
    expect(data.disparities[0]).toMatchObject({ rank: 100, status: "과열", reference: { lower: 100, upper: 100 } });
    expect(data.latest.bands?.upper).toBeCloseTo(101 + Math.sqrt(19) * 2);
    expect(data.bandwidthThreshold).toBe(0);
  });

  it("주변 고가·저가로 가까운 스윙을 묶고 거래량을 중복 없이 배정한다", () => {
    const data = calculateIndexTechnical(makeSessions(140, i => 105 + Math.sin(i / 4) * 12 + i / 100))!;
    expect(data.levels.source).toBe("고가·저가");
    expect(data.levels.swings.some(level => level.touches > 1)).toBe(true);
    const wave = data.levels.fibonacci!;
    expect(wave.levels.map(level => level.ratio)).toEqual([38.2, 50, 61.8]);
    expect(wave.levels[1].price).toBeCloseTo((wave.first.price + wave.last.price) / 2);
    expect(data.levels.profile?.total).toBe(60_000);
    expect(data.levels.profile?.bins.reduce((sum, bin) => sum + bin.volume, 0)).toBe(60_000);
  });

  it("특별 운영일의 종가를 제외하고 미수집 일반 거래일은 계산에 대입하지 않는다", () => {
    const complete = readIndexTechnicalHistory(points, meta, through)!;
    expect(complete.points.find(p => p.date === "2026-11-19")?.close).toBeNull();
    expect(complete.returns[0]).toBeNull();
    expect(complete.latest.averages[5]).toBe(104);

    const missing = readIndexTechnicalHistory(points.filter(p => p.date !== "2026-11-17"), meta, through)!;
    expect(missing.points.find(p => p.date === "2026-11-17")?.close).toBeNull();
    expect(missing.latest.averages[5]).toBeNull();
  });

  it("장중·주말에는 직전 완료일을 선택하며 거래소 미확인 이력을 거부한다", async () => {
    const checks = await Promise.all(["2026-11-24T15:29", "2026-11-24T15:30", "2026-11-22T12:00", "2026-11-19T16:31"].map(date =>
      loadIndexTechnical(new Date(`${date}:00+09:00`))));
    expect(checks.map(result => result.asOf)).toEqual(["2026-11-23", "2026-11-24", through, "2026-11-19"]);
    expect(checks[3].specialSession).toBe(true);
    expect(readIndexTechnicalHistory(points, meta, "2026-11-19")?.latest.date).toBe("2026-11-18");
    expect(readIndexTechnicalHistory(points, { ...meta, source: "통합 시세" }, through)).toBeNull();
  });

  it("KRX 일봉 응답의 OHLC와 거래량을 검증하고 과거 수능일 봉을 제외한다", () => {
    const raw = { TRD_DD: "2024/11/15", OPNPRC_IDX: "2,500.00", HGPRC_IDX: "2,600.00", LWPRC_IDX: "2,450.00", CLSPRC_IDX: "2,550.00", ACC_TRDVOL: "123,456" };
    const bars = parseIndexBars({ output: [raw, { ...raw, TRD_DD: "2024/11/14" }] }, "2024-11-14", "2024-11-15");
    expect(bars).toEqual([{ date: "2024-11-15", open: 2500, high: 2600, low: 2450, close: 2550, volume: 123456 }]);
    expect(() => parseIndexBars({ output: [{ ...raw, HGPRC_IDX: "2,400.00" }] }, "2024-11-15", "2024-11-15")).toThrow();
    const mismatched = readIndexTechnicalHistory(points, meta, through, [{ ...bars[0], date: through }]);
    expect(mismatched?.latest.bar).toBeNull();
    expect(mismatched?.latest.atr).toBeNull();
  });

  it("ADR은 특별 운영일 종가를 비교에 사용한 일별 집계를 제외한다", () => {
    const participants = makeSessions(27, () => 100).map((session, i) => ({
      ...session, date: new Date(Date.UTC(2026, 10, i + 1)).toISOString().slice(0, 10), regular1530: i !== 18,
    }));
    const history = calculateIndexTechnical(participants)!.points;
    const days = participants.map((item, i) => ({ date: item.date, advancers: i === 18 || i === 19 ? 100 : 2, decliners: 1, unchanged: 0, value: null }));
    expect(indexAdr(history, days)).toBe(200);
    expect(indexAdr(history.slice(0, 20), days)).toBeNull();
  });
});
