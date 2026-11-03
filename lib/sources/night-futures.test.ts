import { describe, expect, it } from "vitest";
import { loadNightFutures, parseNightFuturesQuote } from "@/lib/sources/night-futures";

function payload() {
  return { ok: true, futures: {
    source: "night-session", symbol: "A01612", price: 883.4,
    ts: Date.parse("2026-11-03T06:00:00+09:00"),
    // prevClose in this upstream is the night opening reference, not a day close.
    prevClose: 917.05, diffPct: -3.6693746251567516,
    session: {
      start: Date.parse("2026-11-02T18:00:00+09:00") / 1000,
      end: Date.parse("2026-11-03T06:00:00+09:00") / 1000,
      open: 917.05, isOpen: false,
    },
  } };
}

describe("실제 코스피200 야간 체결 수집", () => {
  it("관측한 응답에서 마지막 야간 체결과 시가 대비를 읽는다", () => {
    const quote = parseNightFuturesQuote(payload(), new Date("2026-11-03T08:00:00+09:00"));
    expect(quote).toMatchObject({
      symbol: "A01612", price: 883.4, tradedAt: "2026-11-02T21:00:00.000Z",
      session: "closed", sessionNote: "마지막 야간 기록", changeBasis: "야간 시가 대비",
      sourceName: "PreKOSPI · 한국투자증권 수집",
    });
    expect(quote?.change).toBeCloseTo(-33.65);
    expect(quote?.changePct).toBeCloseTo(-3.6693746);
  });

  it("자정 이후 장중 상태와 체결 지연을 구분한다", () => {
    const data = payload();
    data.futures.source = "realtime";
    data.futures.ts = Date.parse("2026-11-03T01:00:00+09:00");
    data.futures.session.isOpen = true;
    expect(parseNightFuturesQuote(data, new Date("2026-11-03T01:00:30+09:00")))
      .toMatchObject({ session: "open", delayed: false, sessionNote: "야간 장중" });
    expect(parseNightFuturesQuote(data, new Date("2026-11-03T01:02:00+09:00")))
      .toMatchObject({ session: "open", delayed: true, sessionNote: "야간 시세 지연" });
  });

  it("주간·추정 소스, 다른 상품, 체결 시각 누락과 세션 밖 체결을 거부한다", () => {
    const now = new Date("2026-11-03T08:00:00+09:00");
    for (const patch of [
      { source: "day" }, { source: "estimate" }, { symbol: "A02612" },
      { ts: undefined }, { ts: Date.parse("2026-11-02T15:30:00+09:00") },
      { price: 0 }, { price: NaN }, { ts: Date.parse("2026-11-04T01:00:00+09:00") },
    ]) {
      const data = payload();
      Object.assign(data.futures, patch);
      expect(parseNightFuturesQuote(data, now)).toBeNull();
    }
    const data = payload();
    data.futures.session.end += 3600;
    expect(parseNightFuturesQuote(data, now)).toBeNull();
  });

  it("수신 실패와 유효하지 않은 응답에서 주간 가격으로 대체하지 않는다", async () => {
    for (const fetchImpl of [
      async () => { throw new Error("network down"); },
      async () => new Response(null, { status: 503 }),
      async () => Response.json({ ok: true, futures: { source: "day", price: 918.65 } }),
    ]) {
      expect(await loadNightFutures(fetchImpl)).toMatchObject({
        id: "K200-NIGHT", price: null, session: "missing", error: "야간 체결 시세를 수신하지 못했습니다.",
      });
    }
  });
});
