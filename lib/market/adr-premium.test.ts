import { describe, expect, it } from "vitest";
import { adrPremiumSeries } from "@/lib/market/adr-premium";

describe("SK하이닉스 ADR 괴리율", () => {
  it("한국 종가 시점에는 미래의 같은 날 미국 종가를 사용하지 않는다", () => {
    const points = adrPremiumSeries({
      sharesPerReceipt: 0.1, atKoreanClose: true,
      common: [{ date: "2026-10-30", close: 100000 }, { date: "2026-11-02", close: 110000 }],
      adr: [{ date: "2026-10-29", close: 7 }, { date: "2026-10-30", close: 8 }, { date: "2026-11-02", close: 99 }],
      usdkrw: [{ date: "2026-10-29", close: 1400 }, { date: "2026-10-30", close: 1410 }, { date: "2026-11-02", close: 9999 }],
    });
    expect(points[0]).toMatchObject({ date: "2026-10-30", adrDate: "2026-10-29", fxDate: "2026-10-29", adrPerShareKrw: 98000 });
    expect(points[1]).toMatchObject({ date: "2026-11-02", adrDate: "2026-10-30", fxDate: "2026-10-30", adrPerShareKrw: 112800 });
  });
  it("같은 날의 본주와 0.1주 ADR 을 1주 원화로 맞춘다", () => {
    const points = adrPremiumSeries({
      sharesPerReceipt: 0.1,
      common: [
        { date: "2026-10-28", close: 1_000_000 },
        { date: "2026-10-29", close: 1_100_000 },
      ],
      adr: [
        { date: "2026-10-28", close: 80 },
        { date: "2026-10-29", close: 90 },
        { date: "2026-10-30", close: 95 },
      ],
      usdkrw: [
        { date: "2026-10-28", close: 1_300 },
        { date: "2026-10-29", close: 1_400 },
      ],
    });
    expect(points).toEqual([
      {
        date: "2026-10-28",
        commonKrw: 1_000_000,
        adrPerShareKrw: (80 * 1_300) / 0.1,
        premium: ((80 * 1_300) / 0.1 / 1_000_000 - 1) * 100,
      },
      {
        date: "2026-10-29",
        commonKrw: 1_100_000,
        adrPerShareKrw: (90 * 1_400) / 0.1,
        premium: ((90 * 1_400) / 0.1 / 1_100_000 - 1) * 100,
      },
    ]);
  });

  it("본주 종가가 0이면 그 날은 뺀다", () => {
    expect(adrPremiumSeries({
      sharesPerReceipt: 0.1,
      common: [{ date: "2026-10-29", close: 0 }],
      adr: [{ date: "2026-10-29", close: 90 }],
      usdkrw: [{ date: "2026-10-29", close: 1400 }],
    })).toEqual([]);
  });
});
