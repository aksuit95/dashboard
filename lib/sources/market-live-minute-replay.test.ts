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
    vi.setSystemTime(at("17:00:00"));
    const closed = await (await GET(request())).json();
    expect(closed.radar).toMatchObject({ date: tradeDate, baselineDate, live: false });
    expect(closed.day.frames[0]).toHaveProperty("collectedAt", new Date(at("15:29:00")).toISOString());
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
});
