import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/market-live/archive/route";
import { fetchNaverStockMinuteChart, naverStockPreviousKrxClose } from "./naver-market-live";

const tradeDate = "2026-11-18";
const baselineDate = "2026-11-17";
const at = (time: string) => Date.parse(`${tradeDate}T${time}+09:00`);
const codes = ["005930", "000660"];
const request = (search = "") => new Request(`https://dashboard.example/api/market-live/archive${search}`);

vi.mock("./market-live", () => ({
  loadMarketLiveMembers: async () => ({
    members: ["005930", "000660"].map(code => ({ code, market: "KOSPI", sector: "반도체" })),
    warnings: [],
  }),
  loadMarketLiveBoard: async () => {
    const asOf = new Date(at("15:30:00")).toISOString();
    return {
      state: "closed", date: tradeDate, baselineDate, collectedAt: new Date().toISOString(),
      sectors: [{ name: "반도체", changePct: 25, up: 2, total: 2, compared: 2, asOf }],
      rotationStocks: Date.now() < at("15:31:00") ? [] : codes.map(code => ({
        code, market: "KOSPI", sector: "반도체", price: 125, close: 100, asOf,
      })),
    };
  },
}));
vi.mock("./sector-publication", () => ({ readSectorPublication: async () => null }));
vi.mock("./market-live-publication", () => {
  const archive = (date?: string) => {
    const isPublished = Date.now() >= at("15:30:00");
    const dates = isPublished ? [tradeDate, baselineDate] : [baselineDate];
    const day = date && dates.includes(date) ? {
      date, baselineDate: date === tradeDate ? baselineDate : "2026-11-16",
      frames: [{ collectedAt: new Date(at("15:29:00")).toISOString(), sectors: [] }],
    } : null;
    return { dates, day };
  };
  return {
    readSharedMarketLiveArchive: archive,
    readMarketLivePublication: (date: string) => ({
      radar: { date, baselineDate: archive(date).day?.baselineDate, live: false, windows: {} },
    }),
  };
});

function chart(code: string) {
  return {
    code, stockExchangeType: "KRX", infoType: "item", periodType: "day",
    tradeBaseAt: "20261118", lastTradeBaseAt: "20261117", lastClosePrice: 100,
    lastPriceInfos: [
      { localDateTime: "20261117153000", currentPrice: 100 },
      { localDateTime: "20261117195900", currentPrice: 200 },
    ],
    priceInfos: [
      { localDateTime: "20261118085900", currentPrice: 200 },
      { localDateTime: "20261118090000", currentPrice: 101 },
      { localDateTime: "20261118093000", currentPrice: 103 },
      { localDateTime: "20261118095000", currentPrice: 105 },
      { localDateTime: "20261118100000", currentPrice: 110 },
      { localDateTime: "20261118100100", currentPrice: 220 },
      { localDateTime: "20261118143000", currentPrice: 106 },
      { localDateTime: "20261118150000", currentPrice: 108 },
      { localDateTime: "20261118152000", currentPrice: 120 },
      { localDateTime: "20261118153000", currentPrice: 240 },
      { localDateTime: "20261118195900", currentPrice: 250 },
    ],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("공유 KRX 섹터 분봉 API", () => {
  it("하나의 장중 응답으로 이전 분봉과 10·30·60분 비교를 제공하고 같은 집계를 공유한다", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("10:01:10"));
    const upstream = vi.fn<typeof fetch>().mockImplementation(async url => {
      const code = new URL(String(url)).pathname.split("/").at(-1);
      if (!code || !codes.includes(code)) throw new Error("unexpected symbol URL");
      return Response.json(chart(code));
    });
    vi.stubGlobal("fetch", upstream);

    const [first, second] = await Promise.all([GET(request()), GET(request())]);
    expect(first.headers.get("Vercel-CDN-Cache-Control")).toBe("public, s-maxage=180");
    const response = await first.json();
    expect(await second.json()).toEqual(response);
    expect(response.dates).toEqual([tradeDate, baselineDate]);
    expect(response.day).toMatchObject({ date: tradeDate, baselineDate });
    expect(response.day.frames.map((frame: { minuteAt: string }) => frame.minuteAt)).toEqual(
      ["09:00:00", "09:30:00", "09:50:00", "10:00:00"].map(time => new Date(at(time)).toISOString()),
    );
    expect(response.day.frames.at(-1).collectedAt).toBe(new Date(at("10:01:10")).toISOString());
    expect(response.day.frames.at(-1)).not.toHaveProperty("stocks");
    expect(Object.keys(response.radar.windows)).toEqual(["10", "30", "60"]);
    expect(response.radar.windows["10"].rows[0].changePp).toBeCloseTo(5);

    expect((await (await GET(request("?date=2026-11-17"))).json()).day.date).toBe(baselineDate);
    expect((await GET(request("?variant=random"))).status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("마감 확정 전에는 이전 장중 비교를 숨기고 이후에는 공식 종가로 세 구간을 고정한다", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("15:30:05"));
    const upstream = vi.fn<typeof fetch>().mockImplementation(async url => {
      const code = new URL(String(url)).pathname.split("/").at(-1)!;
      const previousDay = chart(code).priceInfos;
      return Response.json({
        ...chart(code), tradeBaseAt: "20261119", lastTradeBaseAt: "20261118",
        priceInfos: [], lastPriceInfos: previousDay,
      });
    });
    vi.stubGlobal("fetch", upstream);
    const pending = await (await GET(request())).json();
    expect(pending.radar).toBeNull();
    expect(pending.warning).toContain("종가 반영");
    expect(upstream).not.toHaveBeenCalled();

    vi.setSystemTime(at("17:00:00"));
    const closed = await (await GET(request())).json();
    const closeAt = new Date(at("15:30:00")).toISOString();
    expect(closed.radar).toMatchObject({ date: tradeDate, baselineDate, closeAt, live: false });
    expect(closed.day.frames[0]).toHaveProperty("collectedAt", new Date(at("15:29:00")).toISOString());
    expect(closed.day.frames.at(-1)).toMatchObject({
      minuteAt: closeAt, collectedAt: new Date(at("17:00:00")).toISOString(), sectors: [{ changePct: 25 }],
    });
    expect(Object.keys(closed.radar.windows)).toEqual(["10", "30", "60"]);
    expect(Object.values(closed.radar.windows).map(window => (window as { to: string }).to)).toEqual([closeAt, closeAt, closeAt]);
    expect(closed.radar.windows["10"].rows[0].changePp).toBeCloseTo(5);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("거래소 식별값과 직전 15:30 확인이 틀리면 시간외 값을 비교 기준으로 쓰지 않는다", async () => {
    const payload = chart(codes[0]);
    const session = { date: tradeDate, openAt: at("09:00:00"), closeAt: at("15:30:00"), now: at("10:01:10") };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...payload, stockExchangeType: "NXT" }));
    await expect(fetchNaverStockMinuteChart(codes[0], session, new AbortController().signal, fetcher)).rejects.toThrow("분봉 기준 불일치");
    expect(naverStockPreviousKrxClose(payload, baselineDate)).toBe(100);
    expect(naverStockPreviousKrxClose({ ...payload, lastClosePrice: 200 }, baselineDate)).toBeNull();
    expect(naverStockPreviousKrxClose({ ...payload, lastPriceInfos: payload.lastPriceInfos.slice(1) }, baselineDate)).toBeNull();
  });

  it("시간 초과된 종목만 한 번 다시 조회하고 레이더 비교에 포함한다", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("10:05:10"));
    const attempts = new Map<string, number>();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async url => {
      const code = new URL(String(url)).pathname.split("/").at(-1)!;
      attempts.set(code, (attempts.get(code) ?? 0) + 1);
      if (code === codes[0] && attempts.get(code) === 1) throw new DOMException("Timed out", "TimeoutError");
      return Response.json(chart(code));
    }));

    const result = await (await GET(request())).json();
    expect(Object.fromEntries(attempts)).toEqual({ [codes[0]]: 2, [codes[1]]: 1 });
    expect(result.warning).toBeUndefined();
    expect(result.coverage).toEqual({ compared: 2, total: 2 });
    expect(result.day.frames.at(-1).sectors[0].compared).toBe(2);
    expect(result.radar.windows["10"].rows[0].compared).toBe(2);
  });

  it("확인되지 않은 분봉과 비교 종가를 구분해 안내한다", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("10:09:10"));
    let limited = true;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => {
      const code = new URL(String(url)).pathname.split("/").at(-1)!;
      if (code === codes[0]) {
        if (limited) return new Response(null, { status: 429 });
        return Response.json({ ...chart(code), lastPriceInfos: [] });
      }
      return Response.json(chart(code));
    });
    vi.stubGlobal("fetch", fetcher);

    const missingChart = await (await GET(request())).json();
    expect(missingChart.warning).toBe("KRX 장중 분봉 미확인 1/2종목");
    expect(fetcher).toHaveBeenCalledTimes(2);

    limited = false;
    vi.setSystemTime(at("10:13:10"));
    const missingClose = await (await GET(request())).json();
    expect(missingClose.warning).toBe("KRX 15:30 비교 종가 미확인 1/2종목");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
