import { describe, expect, it } from "vitest";
import { adrRatio, annualPriceReturns, disparity, etfNetFlow, holdingWeightChanges, marketCapRatio, revenueYoy, sliceByRange, sum } from "@/lib/market/series";
import { changePercent, funding8hPercent, isQuoteStale, perShareKrw, premiumPercent, sharesPerReceiptOn, toUsd } from "@/lib/market/convert";
import { fiftyTwoWeekHigh, moverExclusion, trailingReturn } from "@/lib/market/movers";

describe("1주 환산과 프리미엄", () => {
  it("SKHY 1 ADS = 보통주 0.1주를 1주 원화로 나눈다", () => {
    const price = perShareKrw(164.7, 1335.78, 0.1);
    expect(price).toBeCloseTo((164.7 * 1335.78) / 0.1, 4);
  });

  it("삼성 GDR 1장 = 보통주 25주로 나눈다", () => {
    expect(perShareKrw(4524, 1335.78, 25)).toBeCloseTo((4524 * 1335.78) / 25, 4);
  });

  it("환율이 없거나 배수가 0이면 null", () => {
    expect(perShareKrw(100, 0, 1)).toBeNull();
    expect(perShareKrw(100, 1300, 0)).toBeNull();
  });

  it("기준가가 0이면 프리미엄은 null 이고 0으로 만들지 않는다", () => {
    expect(premiumPercent(110, 100)).toBeCloseTo(10, 6);
    expect(premiumPercent(110, 0)).toBeNull();
    expect(premiumPercent(null, 100)).toBeNull();
  });

  it("법인행동 적용일 전후의 배수를 고른다", () => {
    const schedule = [
      { effective: "2020-01-01", sharesPerReceipt: 1 },
      { effective: "2024-06-01", sharesPerReceipt: 0.1 },
    ];
    expect(sharesPerReceiptOn(schedule, "2024-05-31", 1)).toBe(1);
    expect(sharesPerReceiptOn(schedule, "2024-06-01", 1)).toBe(0.1);
    expect(sharesPerReceiptOn(undefined, "2024-06-01", 0.1)).toBe(0.1);
  });

  it("등락률과 8시간 펀딩", () => {
    expect(changePercent(90, 100)).toBeCloseTo(-10, 6);
    expect(changePercent(90, 0)).toBeNull();
    expect(funding8hPercent(0.0000459104)).toBeCloseTo(0.0000459104 * 8 * 100, 8);
    expect(funding8hPercent(null)).toBeNull();
  });

  it("시총을 달러로 맞춘다", () => {
    const fx = { usdkrw: 1000, eurkrw: 1400, usdjpy: 150 };
    expect(toUsd(1_000_000, "KRW", fx)).toBe(1000);
    expect(toUsd(150, "JPY", fx)).toBe(1);
    expect(toUsd(1, "EUR", fx)).toBe(1.4);
    expect(toUsd(10, "KRW", { usdkrw: null, eurkrw: null, usdjpy: null })).toBeNull();
  });
});

describe("ADR, 이격도, ETF, 연간 수익률", () => {
  it("20일 상승/하락 합으로 ADR 을 계산하고 보합은 무시한다", () => {
    const days = Array.from({ length: 20 }, () => ({ advancers: 2, decliners: 1, unchanged: 50 }));
    expect(adrRatio(days)).toBeCloseTo(200, 6);
  });

  it("20일을 넘는 시계열은 최근 20일만 쓴다", () => {
    const older = Array.from({ length: 10 }, () => ({ advancers: 100, decliners: 1, unchanged: 0 }));
    const newer = Array.from({ length: 20 }, () => ({ advancers: 1, decliners: 1, unchanged: 9 }));
    expect(adrRatio([...older, ...newer])).toBeCloseTo(100, 6);
  });

  it("하락 합이 0이거나 20거래일이 안 되면 null", () => {
    expect(adrRatio([])).toBeNull();
    expect(adrRatio([{ advancers: 3, decliners: 0, unchanged: 1 }])).toBeNull();
    const short = Array.from({ length: 19 }, () => ({ advancers: 2, decliners: 1, unchanged: 0 }));
    expect(adrRatio(short)).toBeNull();
  });

  it("이격도는 종가 / 이동평균 × 100", () => {
    expect(disparity([1, 2, 3, 4, 5], 5)).toBeCloseTo((5 / 3) * 100, 6);
    expect(disparity([1, 2, 3], 5)).toBeNull();
    expect(disparity([0, 0, 0], 3)).toBeNull();
  });

  it("ETF 순유출입은 NAV 가 없으면 계산하지 않는다", () => {
    expect(etfNetFlow(100, 110, 10)).toBe(100);
    expect(etfNetFlow(100, 90, 10)).toBe(-100);
    expect(etfNetFlow(100, 110, null)).toBeNull();
    expect(etfNetFlow(null, 110, 10)).toBeNull();
  });

  it("시총 비율은 분자 합 / 분모 합", () => {
    expect(marketCapRatio([2, 3], [10])).toBeCloseTo(50, 6);
    expect(marketCapRatio([1], [0])).toBeNull();
    expect(marketCapRatio([], [1])).toBeNull();
  });

  it("연간 수익률은 전년 말 대비이고 올해가 끝나지 않았으면 YTD", () => {
    const bars = [
      { date: "2023-01-02", close: 50 },
      { date: "2023-12-28", close: 100 },
      { date: "2024-12-30", close: 110 },
      { date: "2025-06-01", close: 121 },
    ];
    const rows = annualPriceReturns(bars);
    expect(rows.map((row) => row.year)).toEqual([2024, 2025]);
    expect(rows[0].returnPct).toBeCloseTo(10, 6);
    expect(rows[1].returnPct).toBeCloseTo(10, 6);
    expect(rows[0].ytd).toBe(false);
    expect(rows[1].ytd).toBe(true);
  });

  it("직전 연도가 비면 그해 수익률을 만들지 않는다", () => {
    const rows = annualPriceReturns([
      { date: "2022-12-30", close: 100 },
      { date: "2024-12-30", close: 200 },
    ]);
    expect(rows).toEqual([]);
  });

  it("구간 슬라이스", () => {
    const points = [
      { date: "2024-01-01", value: 1 },
      { date: "2025-12-01", value: 2 },
      { date: "2026-01-15", value: 3 },
    ];
    expect(sliceByRange(points, "6M").map((point) => point.date)).toEqual(["2025-12-01", "2026-01-15"]);
  });
});

describe("보유 비중, 매출 YoY, 스테일", () => {
  it("스냅샷이 하루뿐이면 비중 변화를 계산하지 않는다", () => {
    expect(holdingWeightChanges(null, [{ symbol: "A", name: "A", weight: 10 }])).toBeNull();
    expect(holdingWeightChanges([], [{ symbol: "A", name: "A", weight: 10 }])).toBeNull();
  });

  it("이틀이 있으면 퍼센트 포인트 차이를 만든다", () => {
    const changes = holdingWeightChanges(
      [{ symbol: "A", name: "에이", weight: 10 }],
      [
        { symbol: "A", name: "에이", weight: 12 },
        { symbol: "B", name: "비", weight: 3 },
      ],
    );
    expect(changes).toEqual([
      { symbol: "A", name: "에이", previous: 10, current: 12, delta: 2 },
      { symbol: "B", name: "비", previous: 0, current: 3, delta: 3 },
    ].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)));
  });

  it("섹터 YoY 는 매출 합 기준이라 종목 YoY 평균과 다르다", () => {
    const current = sum([100, 50]);
    const prior = sum([80, 50]);
    expect(revenueYoy(current, prior)).toBeCloseTo((150 / 130 - 1) * 100, 6);
    const averageYoy = ((100 / 80 - 1) * 100 + 0) / 2;
    expect(revenueYoy(current, prior)).not.toBeCloseTo(averageYoy, 4);
    expect(revenueYoy(10, 0)).toBeNull();
  });

  it("수집 실패이거나 주기의 3배가 지나면 스테일", () => {
    expect(isQuoteStale({ fetchedAt: "2026-01-01T00:00:00.000Z", now: "2026-01-01T00:00:10.000Z", intervalMs: 20_000, failed: false })).toBe(false);
    expect(isQuoteStale({ fetchedAt: "2026-01-01T00:00:00.000Z", now: "2026-01-01T00:01:10.000Z", intervalMs: 20_000, failed: false })).toBe(true);
    expect(isQuoteStale({ fetchedAt: "2026-01-01T00:00:00.000Z", now: "2026-01-01T00:00:10.000Z", intervalMs: 20_000, failed: true })).toBe(true);
  });
});

describe("급등락 제외와 52주", () => {
  it("ETF 와 시총 미달, 시총 미확인을 제외한다", () => {
    expect(moverExclusion({ marketCap: 2e9, capCurrency: "USD", instrumentClass: "etf" }).excluded).toBe(true);
    expect(moverExclusion({ marketCap: 50e9, capCurrency: "KRW", instrumentClass: "equity" }).reason).toBe("시가총액 기준 미달");
    expect(moverExclusion({ marketCap: 200e9, capCurrency: "KRW", instrumentClass: "equity" }).excluded).toBe(false);
    expect(moverExclusion({ marketCap: 0.5e9, capCurrency: "USD", instrumentClass: "equity" }).excluded).toBe(true);
    expect(moverExclusion({ marketCap: 2e9, capCurrency: "USD", instrumentClass: "equity" }).excluded).toBe(false);
    expect(moverExclusion({ marketCap: null, capCurrency: "USD", instrumentClass: "equity" }).reason).toBe("시총 미확인");
  });

  it("52주 창이 짧으면 shortWindow 이고, 마지막 값이 최고가면 신고가", () => {
    expect(fiftyTwoWeekHigh([1, 2, 3])?.high).toBe(true);
    expect(fiftyTwoWeekHigh([1, 5, 4])?.high).toBe(false);
    expect(fiftyTwoWeekHigh([1, 2])?.shortWindow).toBe(true);
    expect(trailingReturn([100, 110, 121], 2)).toBeCloseTo(21, 6);
    expect(trailingReturn([100], 1)).toBeNull();
  });
});
