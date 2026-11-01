import { describe, expect, it } from "vitest";
import { parseCalendarEvents } from "@/lib/sources/google-calendar";
import { naverCapToKrw, parseNaverBreadth, parseNaverIndex, parseNaverMarketCap } from "@/lib/sources/naver";
import { cleanNewsTitle, parseNaverNews } from "@/lib/sources/naver-news";

describe("챗봇 네이버 시세 파서", () => {
  it("시가총액 억 원 단위를 원으로 바꾸고 ETF 는 뺀다", () => {
    expect(naverCapToKrw(12_832_582, "12,832,582")).toBe(1_283_258_200_000_000);
    expect(naverCapToKrw(1_283_258_200_000_000, null)).toBe(1_283_258_200_000_000);
    const ranks = parseNaverMarketCap({
      stocks: [
        { stockEndType: "etf", itemCode: "069500", stockName: "KODEX 200", fluctuationsRatio: "1.00", closePrice: "40,000", marketValue: "1" },
        { stockEndType: "stock", itemCode: "005930", stockName: "삼성전자", fluctuationsRatio: "-5.39", closePrice: "219,500", marketValue: "12,832,582" },
      ],
    });
    expect(ranks).toEqual([
      { rank: 1, itemCode: "005930", name: "삼성전자", price: 219500, changePct: -5.39, marketCapKrw: 1_283_258_200_000_000 },
    ]);
  });

  it("형식이 바뀌면 null 이라서 이전 순위를 지우지 않는다", () => {
    expect(parseNaverMarketCap({ items: [] })).toBeNull();
    expect(parseNaverMarketCap({ stocks: [] })).toBeNull();
    expect(parseNaverIndex({ itemCode: "KOSPI", stockName: "코스피", closePrice: "5,650.81", fluctuationsRatio: "-4.83" })).toEqual({
      itemCode: "KOSPI",
      name: "코스피",
      price: 5650.81,
      changePct: -4.83,
    });
  });

  it("등락 종목 수는 쉼표를 빼고 상한·하한은 더하지 않는다", () => {
    expect(parseNaverBreadth({
      upDownStockInfo: { upperCount: "2", riseCount: "227", lowerCount: "0", fallCount: "1,475", steadyCount: "37" },
      dealTrendInfo: { bizdate: "20261030" },
    }, "KOSDAQ", "2026-10-31")).toEqual({
      market: "KOSDAQ",
      date: "2026-10-30",
      advancers: 227,
      decliners: 1475,
      unchanged: 37,
    });
    expect(parseNaverBreadth({ upDownStockInfo: { riseCount: "0", fallCount: "0", steadyCount: "0" } }, "KOSPI", "2026-10-30")).toBeNull();
    expect(parseNaverBreadth({ totalInfos: [] }, "KOSPI", "2026-10-30")).toBeNull();
  });
});

describe("챗봇 뉴스·일정 파서", () => {
  it("뉴스 태그를 지우고 원문 링크를 고르며 중복을 뺀다", () => {
    expect(cleanNewsTitle("코스피 <b>급락</b> &quot;충격&quot;")).toBe('코스피 급락 "충격"');
    const items = parseNaverNews({
      items: [
        { title: "<b>하나</b>", originallink: "https://press.example/1", link: "https://n.news/1" },
        { title: "하나 중복", originallink: "https://press.example/1", link: "https://n.news/1b" },
        { title: "둘", link: "https://n.news/2" },
      ],
    });
    expect(items?.map((item) => item.link)).toEqual(["https://press.example/1", "https://n.news/2"]);
  });

  it("취소·거절 일정은 빼고 종일 일정을 남긴다", () => {
    const events = parseCalendarEvents("개인", [
      { status: "cancelled", summary: "취소", start: { date: "2026-10-30" } },
      { summary: "거절", start: { dateTime: "2026-10-30T09:00:00+09:00" }, attendees: [{ self: true, responseStatus: "declined" }] },
      { summary: "회의", start: { date: "2026-10-30" } },
    ]);
    expect(events).toEqual([{ calendarName: "개인", title: "회의", when: "종일" }]);
  });
});
