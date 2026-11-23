import { describe, expect, it } from "vitest";
import type { MarketLiveRotationStock } from "./market-live";
import { packMarketLiveReplayStocks, type MarketLiveArchiveFrame } from "./market-live-archive";
import { calculateMarketLiveCloseRadar, compareMarketLiveRotation, marketLiveRotationBounds } from "./market-live-rotation";
import { resolveMarketLiveSession } from "./market-live-session";

const day = "2026-11-18";
const earlier = `${day}T10:00:10+09:00`;
const later = `${day}T10:10:20+09:00`;

function stock(code: string, price: number, asOf: string, close = 100): MarketLiveRotationStock {
  return { market: "KOSPI", sector: "반도체", code, price, asOf, close };
}

function frame(collectedAt: string, stocks: MarketLiveRotationStock[]): MarketLiveArchiveFrame {
  return { collectedAt, stocks, sectors: [{ name: "반도체", total: 4, up: 0, compared: stocks.length, changePct: null, asOf: null }] };
}

describe("KRX 장중 섹터 순환매", () => {
  it("동일 종목과 동일 종가로 최솟값 이상의 비교 표본을 유지한다", () => {
    const first = frame(earlier, [stock("000001", 90, earlier), stock("000002", 100, earlier), stock("000003", 185, earlier), stock("000004", 80, earlier)]);
    const next = frame(later, [stock("000001", 95, later), stock("000002", 105, later), stock("000004", 108, later, 110)]);
    const data = compareMarketLiveRotation(first, next, 10);
    expect(data).toMatchObject({ minutes: 10, from: earlier, to: later, rows: [{ name: "반도체", changePp: 5, up: 2, compared: 2, total: 4 }] });
    expect(data?.rows[0].nowPct).toBeCloseTo(0);
    expect(compareMarketLiveRotation(first, frame(later, [next.stocks[0], first.stocks[1]]), 10)).toBeNull();
  });

  it("당일 등락률의 부호와 관계없이 구간에 오른 종목만 센다", () => {
    const first = frame(earlier, [stock("000001", 85, earlier), stock("000002", 105, earlier), stock("000003", 120, earlier)]);
    const last = frame(later, [stock("000001", 90, later), stock("000002", 105, later), stock("000003", 115, later)]);
    expect(compareMarketLiveRotation(first, last, 10)?.rows[0]).toMatchObject({ up: 1, compared: 3, total: 4 });
  });

  it.each([10, 30, 60] as const)("선택한 %i분 전 기록과 허용 지연만 비교한다", minutes => {
    const { from, through } = marketLiveRotationBounds(Date.parse(later), minutes);
    expect(through).toBe(Date.parse(later) - minutes * 60_000);
    const next = frame(later, [stock("000001", 95, later), stock("000002", 105, later)]);
    const prior = (timestamp: number) => {
      const at = new Date(timestamp).toISOString();
      return frame(at, [stock("000001", 90, at), stock("000002", 100, at)]);
    };
    expect(compareMarketLiveRotation(prior(through), next, minutes)?.minutes).toBe(minutes);
    expect(compareMarketLiveRotation(prior(from), next, minutes)?.minutes).toBe(minutes);
    expect(compareMarketLiveRotation(prior(through + 1), next, minutes)).toBeNull();
    expect(compareMarketLiveRotation(prior(from - 1), next, minutes)).toBeNull();
  });

  it("게시본의 개별 종목 기록을 15:30 종가와 비교하고 표본이 부족한 동시호가 경계를 건너뛴다", () => {
    const times = ["14:29:08", "14:59:08", "15:19:08", "15:20:00"].map(clock => `${day}T${clock}+09:00`);
    const records = times.map((time, index) => frame(time, index === 3 ? [stock("000001", 97, time)] :
      [stock("000001", 90 + index, time), stock("000002", 100, time)]));
    const closeAt = `${day}T15:30:00+09:00`;
    const closing = { ...frame(`${day}T16:20:00+09:00`, [stock("000001", 105, closeAt), stock("000002", 110, closeAt)]), minuteAt: closeAt };
    const archive = {
      date: day, baselineDate: "2026-11-17",
      frames: records.map(({ stocks: _stocks, ...saved }) => saved),
      stockTape: packMarketLiveReplayStocks(Date.parse(`${day}T09:00:00+09:00`), records, new Map()),
    };
    const radar = calculateMarketLiveCloseRadar(archive, closing);
    expect(radar).toMatchObject({ live: false, closeAt, windows: {
      10: { from: times[2], to: closeAt, rows: [{ compared: 2, up: 2 }] },
      30: { from: times[1], to: closeAt },
      60: { from: times[0], to: closeAt },
    } });
  });
});

describe("장중 기록용 정규장 달력", () => {
  it("수능일은 16:30 마감하고 다음 날 비교 기준일로 사용한다", () => {
    const session = (date: string, hhmm: string) => resolveMarketLiveSession(Date.parse(`${date}T${hhmm}:00+09:00`));
    expect(session("2026-11-19", "09:59")).toMatchObject({ state: "closed", date: "2026-11-18" });
    expect(session("2026-11-19", "10:00")).toMatchObject({ state: "open", baselineDate: "2026-11-18" });
    expect(session("2026-11-19", "15:30").state).toBe("open");
    expect(session("2026-11-19", "16:20").state).toBe("auction");
    expect(session("2026-11-19", "16:30").state).toBe("closed");
    expect(session("2026-11-20", "10:00")).toMatchObject({ state: "open", baselineDate: "2026-11-19" });
    expect(session("2026-11-20", "15:30")).toMatchObject({ state: "closed", closeAt: Date.parse("2026-11-20T15:30:00+09:00") });
  });
});
