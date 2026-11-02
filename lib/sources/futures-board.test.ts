import { describe, expect, it } from "vitest";
import { asiaMarketSession, clockSession, loadMarketBoard, parseNaverFuturesQuote, parseYahooChartQuote, usCashSession } from "@/lib/sources/futures-board";

describe("선물·매크로 시세", () => {
  it("12개 지표를 성격별로 묶고 개별 조회 실패가 다른 지표를 가리지 않는다", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("naver.com")) {
        return Response.json({ closePrice: "900", marketStatus: "OPEN" });
      }
      const symbol = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!);
      requested.push(symbol);
      if (symbol === "000688.SS") throw new Error("upstream unavailable");
      return Response.json({ chart: { result: [{ meta: {
        regularMarketPrice: 100,
        fulldayChange: 1,
        fulldayChangePercent: 1.01,
        regularMarketTime: 1_700_000_000,
      } }] } });
    };
    const board = await loadMarketBoard(fetchImpl, new Date("2026-11-02T01:00:00Z"));
    expect(board.futures.map((card) => card.id)).toEqual(["FUT", "NQ=F", "ES=F"]);
    expect(board.asia.map((card) => card.id)).toEqual(["^N225", "^TWII", "000688.SS"]);
    expect(board.usIndicators.map((card) => card.id)).toEqual(["^SOX", "^VIX"]);
    expect(board.currencies.map((card) => card.id)).toEqual(["KRW=X", "DX-Y.NYB"]);
    expect(board.macro.map((card) => card.id)).toEqual(["^TNX", "CL=F"]);
    expect(requested).toHaveLength(11);
    expect(board.asia[2]).toMatchObject({ price: null, session: "missing" });
    expect(board.asia[0].price).toBe(100);
    expect(board.usIndicators[1]).toMatchObject({ price: 100, unit: "points" });
  });

  it("야후 전일 대비는 fulldayChange 를 쓴다", () => {
    const quote = parseYahooChartQuote({
      chart: {
        result: [{
          meta: {
            fulldayPrice: 28971,
            fulldayChange: -591,
            fulldayChangePercent: -2,
            chartPreviousClose: 29437.25,
            regularMarketTime: 1_700_000_000,
          },
        }],
      },
    });
    expect(quote).toEqual({
      price: 28971,
      change: -591,
      changePct: -2,
      tradedAtMs: 1_700_000_000_000,
      regularSession: null,
    });
  });

  it("네이버 선물 장마감과 등락을 읽는다", () => {
    expect(parseNaverFuturesQuote({
      closePrice: "915.10",
      compareToPreviousClosePrice: "-19.90",
      fluctuationsRatio: "-2.13",
      marketStatus: "CLOSE",
    })).toEqual({ price: 915.1, change: -19.9, changePct: -2.13, session: "closed" });
    expect(parseNaverFuturesQuote({ closePrice: "900", marketStatus: "OPEN" })?.session).toBe("live");
  });

  it("시세 시각이 20분을 넘으면 장마감이다", () => {
    const now = Date.parse("2026-10-30T07:00:00Z");
    expect(clockSession(now - 5 * 60 * 1000, now)).toBe("live");
    expect(clockSession(now - 21 * 60 * 1000, now)).toBe("closed");
    expect(clockSession(null, now)).toBe("closed");
  });

  it("아시아 거래 상태는 시세 지연과 별도로 세션·점심휴장을 반영한다", () => {
    const period = { startMs: Date.parse("2026-11-02T01:30:00Z"), endMs: Date.parse("2026-11-02T07:00:00Z") };
    expect(asiaMarketSession("000688.SS", period, new Date("2026-11-02T02:30:00Z"))).toBe("open");
    expect(asiaMarketSession("000688.SS", period, new Date("2026-11-02T03:30:00Z"))).toBe("break");
    expect(asiaMarketSession("000688.SS", period, new Date("2026-11-02T04:59:00Z"))).toBe("break");
    expect(asiaMarketSession("000688.SS", period, new Date("2026-11-02T05:00:00Z"))).toBe("open");
    expect(asiaMarketSession("000688.SS", period, new Date("2026-11-02T07:00:00Z"))).toBe("closed");
    expect(asiaMarketSession("000688.SS", period, new Date("2026-11-02T01:00:00Z"))).toBe("pre");
    const taiwan = { startMs: Date.parse("2026-11-02T01:00:00Z"), endMs: Date.parse("2026-11-02T05:30:00Z") };
    expect(asiaMarketSession("^TWII", taiwan, new Date("2026-11-02T04:23:00Z"))).toBe("open");
    expect(asiaMarketSession("^TWII", taiwan, new Date("2026-11-02T05:30:00Z"))).toBe("closed");
    expect(asiaMarketSession("^TWII", taiwan, new Date("2026-11-03T02:00:00Z"))).toBe("unknown");
    expect(asiaMarketSession("^TWII", null, new Date("2026-11-02T02:00:00Z"))).toBe("unknown");
    expect(asiaMarketSession("^TWII", taiwan, new Date("2026-11-07T02:00:00Z"))).toBe("closed");
    const japan = { startMs: Date.parse("2026-11-02T00:00:00Z"), endMs: Date.parse("2026-11-02T06:30:00Z") };
    expect(asiaMarketSession("^N225", japan, new Date("2026-11-02T02:30:00Z"))).toBe("break");
    expect(asiaMarketSession("^N225", japan, new Date("2026-11-02T03:30:00Z"))).toBe("open");
  });

  it("40분 지연된 대만 시세도 장중 상태를 유지하고 지연을 따로 표시한다", async () => {
    const now = new Date("2026-11-02T02:00:00Z");
    const fetchImpl: typeof fetch = async () => Response.json({ chart: { result: [{ meta: {
      regularMarketPrice: 100,
      regularMarketTime: now.getTime() / 1000 - 40 * 60,
      currentTradingPeriod: { regular: { start: Date.parse("2026-11-02T01:00:00Z") / 1000, end: Date.parse("2026-11-02T05:30:00Z") / 1000 } },
    } }] } });
    const board = await loadMarketBoard(fetchImpl, now);
    expect(board.asia[1]).toMatchObject({ session: "open", delayed: true, tradedAt: "2026-11-02T01:20:00.000Z" });
  });

  it("미국 정규장 밖이면 금리는 장마감이다", () => {
    expect(usCashSession(new Date("2026-10-30T14:00:00Z"))).toBe("live");
    expect(usCashSession(new Date("2026-10-30T21:00:00Z"))).toBe("closed");
    expect(usCashSession(new Date("2026-10-31T15:00:00Z"))).toBe("closed");
  });
});
