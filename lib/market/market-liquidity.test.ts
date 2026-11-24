import { describe, expect, it } from "vitest";
import { changeOver, creditToMarketCap, indexTurnoverProfile } from "./market-liquidity";
import { parseFundFlows, parseMarginLoans, parseMarketFunds } from "@/lib/sources/market-liquidity-kofia";
import { parsePutCallRatio } from "@/lib/sources/market-liquidity-krx";

const from = "2026-11-18", through = "2026-11-20";

describe("시장 유동성 원본 검증", () => {
  it("별도 파생예수금을 예탁금에 더하거나 빼지 않고 공표 비중을 보존한다", () => {
    const payload = { ds1: [{ TMPV1: "20261120", TMPV2: 82_984_549_312_154, TMPV3: 31_801_259_825_789,
      TMPV5: 901_495_111_886, TMPV6: 5_307_024_728, TMPV7: 0.5 }, { TMPV1: "합계" }] };
    expect(parseMarketFunds(payload, from, through)).toEqual([{ date: through, deposits: 82_984_549_312_154,
      derivativesDeposits: 31_801_259_825_789, unpaid: 901_495_111_886, forcedSale: 5_307_024_728, forcedSalePct: 0.5 }]);
  });

  it("신용융자 합계와 국내 주식형 펀드의 음수 순설정액을 검증한다", () => {
    const row = { TMPV1: "20261120", TMPV2: 100, TMPV3: 75, TMPV4: 25 };
    expect(parseMarginLoans({ ds1: [row] }, from, through)[0]).toEqual({ date: through, total: 100, kospi: 75, kosdaq: 25 });
    expect(() => parseMarginLoans({ ds1: [{ ...row, TMPV4: 0 }] }, from, through)).toThrow("시장 합계 불일치");
    const fund = { TMPV1: "20261120", TMPV2: 120, TMPV3: 80, TMPV5: 25, TMPV6: 60, TMPV7: -35, TMPV99: "W" };
    expect(parseFundFlows({ ds1: [fund] }, from, through)[0]).toEqual({ date: through, subscriptions: 25, redemptions: 60, net: -35 });
    expect(() => parseFundFlows({ ds1: [{ ...fund, TMPV99: "U" }] }, from, through)).toThrow("단위 확인 실패");
  });

  it("주간장 코스피200 월물 풋·콜만 집계하고 KRX 전체 거래량과 대조한다", () => {
    const output = [
      { ISU_NM: "코스피200 C 202612 180.0 (주간)", ISU_CD: "C", SECUGRP_ID: "OP", ACC_TRDVOL: "1,000" },
      { ISU_NM: "코스피200 P 202612 180.0 (주간)", ISU_CD: "P", SECUGRP_ID: "OP", ACC_TRDVOL: "600" },
    ];
    expect(parsePutCallRatio({ output }, 1_600)).toBe(0.6);
    expect(() => parsePutCallRatio({ output }, 1_601)).toThrow("합계 불일치");
    expect(() => parsePutCallRatio({ output: output.map(row => ({ ...row, ISU_NM: row.ISU_NM.replace("주간", "야간") })) }, 1_600)).toThrow("주간장 종목 확인 실패");
  });
});

describe("시장 유동성 계산", () => {
  const rows = [
    { date: from, close: 100, turnover: 100, marketCap: 10_000 },
    { date: "2026-11-19", close: 108, turnover: null, marketCap: null },
    { date: through, close: 110, turnover: 300, marketCap: 20_000 },
  ];

  it("같은 날의 시총만 쓰고 거래대금 누락일은 매물대 비중에서 제외한다", () => {
    expect(creditToMarketCap([{ date: "2026-11-19", balance: 1_000 }, { date: through, balance: 300 }], rows)).toEqual([{ date: through, value: 1.5 }]);
    const profile = indexTurnoverProfile(rows, 21, 4)!;
    expect(profile).toMatchObject({ total: 400, coveredDays: 2, priceDays: 3, through, lastClose: 110 });
    expect(profile.bins.map(bin => bin.turnover)).toEqual([100, 0, 0, 300]);
  });

  it("5거래일 증감에 필요한 비교일이 없으면 결측으로 남긴다", () => {
    expect(changeOver(rows.map(row => ({ date: row.date, value: row.close })), 5)).toBeNull();
    expect(changeOver(rows.map(row => ({ date: row.date, value: row.close })), 2)).toBe(10);
  });
});
