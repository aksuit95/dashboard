import { describe, expect, it } from "vitest";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { buildRadarSnapshot, marketCapFromNaverListedShares, parseNaverRadarQuote, parseRadarQuotes, parseRadarSecurities, radarCloseTime, type KrxRadarDay, type KrxRadarQuote, type RadarSecurity } from "./krx";
import { calculateRadarMetrics, radarSignal } from "./model";
import { getRadarChart } from "./publication";

const company: RadarSecurity = { code: "005930", name: "삼성전자", market: "KOSPI", listedOn: "1975-06-11" };
const end = "2026-11-20";

function priceHistory() {
  const days: KrxRadarDay[] = [];
  const cursor = new Date(`${end}T00:00:00Z`);
  for (let index = 0; index < 254; index++) {
    const date = cursor.toISOString().slice(0, 10);
    days.unshift({ date, source: "KRX_OPEN_API", priceTime: radarCloseTime(date), markets: { KOSPI: { [company.code]: { close: 100, reference: 100, shares: 1000, turnover: 200, volume: 2 } }, KOSDAQ: {} } });
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function quote(day: KrxRadarDay): KrxRadarQuote {
  return day.markets.KOSPI[company.code]!;
}

describe("closing stock radar", () => {
  it("distinguishes current drawdown from MDD and orders the peak before the trough", () => {
    const points = [50, 100, 60, 90].map((price, i) => ({ price, date: `2026-07-0${i + 1}` }));
    const metrics = calculateRadarMetrics(points, 3)!;
    expect(metrics).toMatchObject({ mddPct: -40, currentDrawdownPct: -10, mddPeak: points[1], mddTrough: points[2] });
    expect(radarSignal(metrics, "drawdown", -20)).toBeNull();
    expect(calculateRadarMetrics(points, 4)).toBeNull();
  });

  it("excludes equal records and uses preceding closes for strict breakouts", () => {
    const points = [100, 70, 100].map((price, i) => ({ price, date: `2026-07-0${i + 1}` }));
    expect(calculateRadarMetrics(points, 2)).toMatchObject({ breakoutPct: null, breakdownPct: null });
    expect(calculateRadarMetrics([...points.slice(0, -1), { ...points[2], price: 110 }], 2)?.breakoutPct).toBe(10);
    expect(calculateRadarMetrics([...points.slice(0, -1), { ...points[2], price: 56 }], 2)?.breakdownPct).toBeCloseTo(-20);
  });

  it("uses the KRX common-stock classification and rejects an inconsistent close or session", () => {
    const row = { ISU_SRT_CD: company.code, ISU_ABBRV: company.name, LIST_DD: "19750611", MKT_TP_NM: "KOSPI", SECUGRP_NM: "주권", KIND_STKCERT_TP_NM: "보통주" };
    expect(parseRadarSecurities([row, { ...row, ISU_SRT_CD: "005935", KIND_STKCERT_TP_NM: "구형우선주" }, { ...row, ISU_SRT_CD: "111111", SECUGRP_NM: "부동산투자회사" }], "KOSPI", end)).toEqual([company]);
    const daily = { BAS_DD: "20261120", ISU_CD: company.code, MKT_NM: "KOSPI", TDD_CLSPRC: "80", CMPPREVDD_PRC: "-20", FLUC_RT: "-20.00", LIST_SHRS: "1000", MKTCAP: "80,000", ACC_TRDVAL: "244,000", ACC_TRDVOL: "3020" };
    expect(parseRadarQuotes([daily], "KOSPI", end)[company.code]).toEqual({ close: 80, reference: 100, shares: 1000, turnover: 244000, volume: 3020 });
    expect(parseRadarQuotes([{ ...daily, TDD_CLSPRC: "90" }], "KOSPI", end)[company.code]).toBeNull();
    expect(() => parseRadarQuotes([{ ...daily, BAS_DD: "20261119" }], "KOSPI", end)).toThrow();
  });

  it("rejects an intraday or NXT quote even when the fields otherwise look valid", () => {
    const row = { itemCode: company.code, stockExchangeType: "KOSPI", stockEndType: "stock", currencyType: "KRW", marketStatus: "CLOSE", localTradedAt: `${end}T15:30:00+09:00`, currentPrice: "80", countOfListedStock: "1000", marketValue: "80000", accumulatedTradingValue: "200", accumulatedTradingVolume: "2", fluctuations: "-20", fluctuationsRatio: "-20.00", overMarketPriceInfo: { overPrice: "90" } };
    expect(parseNaverRadarQuote(row, company, end)?.close).toBe(80);
    expect(parseNaverRadarQuote({ ...row, marketStatus: "OPEN" }, company, end)).toBeNull();
    expect(parseNaverRadarQuote({ ...row, localTradedAt: `${end}T20:00:00+09:00` }, company, end)).toBeNull();
    expect(parseNaverRadarQuote({ ...row, stockExchangeType: "NXT" }, company, end)).toBeNull();
    const delayed = { ...row, marketStatus: "OPEN", localTradedAt: `${end}T15:32:10+09:00` };
    expect(parseNaverRadarQuote(delayed, company, end, { price: 80, volume: 2 })?.close).toBe(80);
    expect(parseNaverRadarQuote(delayed, company, end, { price: 90, volume: 2 })).toBeNull();
    expect(parseNaverRadarQuote(delayed, company, end, { price: 80, volume: 3 })).toBeNull();
    const after = { ...row, localTradedAt: `${end}T18:00:00+09:00`, currentPrice: "95", marketValue: "95000" };
    expect(marketCapFromNaverListedShares(after, { ...company, close: 80 }, end)).toBe(80_000);
    expect(marketCapFromNaverListedShares(after, { ...company, close: 80 }, "2026-11-23")).toBeNull();
    expect(marketCapFromNaverListedShares({ ...after, marketValue: "90000" }, { ...company, close: 80 }, end)).toBeNull();
  });

  it("excludes special-session prices while keeping an explicit 15:30 closing basis", () => {
    const days = priceHistory();
    const special = days.at(-2)!;
    expect(special.priceTime).toBe("16:30");
    quote(special).close = 110;
    quote(days.at(-1)!).reference = 110;
    const snapshot = buildRadarSnapshot(end, days, [company], "2026-11-20T16:00:00+09:00");
    expect(snapshot.dates).not.toContain(special.date);
    expect(snapshot.rows[0]).toMatchObject({ close: 100, marketCap: 100_000 });
    expect(snapshot.rows[0].metrics["52w"]).toMatchObject({ priorHigh: { price: 100 }, mddPct: 0 });
    expect(() => buildRadarSnapshot(special.date, days.slice(0, -1), [company], snapshot.fetchedAt)).toThrow("15:30 종가 없음");
    expect(reviewedCloseSession(new Date("2026-11-23T14:00:00+09:00"), 0)).toBe(end);
    expect(reviewedCloseSession(new Date("2026-11-23T15:30:00+09:00"), 0)).toBe("2026-11-23");
    expect(reviewedCloseSession(new Date("2026-11-19T16:10:00+09:00"), 0)).toBe("2026-11-18");
    expect(reviewedCloseSession(new Date("2026-11-19T16:30:00+09:00"), 0)).toBe(special.date);
  });

  it("bridges a confirmed split but never bridges an unexplained gap", () => {
    const days = priceHistory();
    for (const day of days.slice(-30)) Object.assign(quote(day), { shares: 2000, close: 50, reference: 50 });
    quote(days.at(-1)!).close = 30;
    const snapshot = buildRadarSnapshot(end, days, [company], "2026-11-20T16:00:00+09:00");
    expect(snapshot.rows[0].metrics["52w"]).toMatchObject({ mddPct: -40, currentDrawdownPct: -40, priorHigh: { price: 50 } });
    const chart = getRadarChart(snapshot, company.code, "52w")!;
    expect(chart.adjusted).toBe(true);
    expect(chart.points[0].price).toBe(50);
    expect(chart.points.at(-1)?.price).toBe(30);
    expect(getRadarChart(snapshot, company.code, "1m")?.adjusted).toBe(false);
    quote(days.at(-30)!).reference = 49;
    const unresolved = buildRadarSnapshot(end, days, [company], snapshot.fetchedAt);
    expect(unresolved.rows[0].metrics["52w"]).toBeNull();
    expect(unresolved.rows[0].metrics["1m"]?.mddPct).toBe(-40);
    days.at(-10)!.markets.KOSPI[company.code] = null;
    expect(buildRadarSnapshot(end, days, [company], snapshot.fetchedAt).rows[0].metrics["1m"]).toBeNull();
  });

  it("uses the dated KRX closes available for a new listing in the shared chart", () => {
    const recent = { ...company, listedOn: "2026-11-15" };
    const snapshot = buildRadarSnapshot(end, priceHistory(), [recent], "2026-11-20T16:00:00+09:00");
    const chart = getRadarChart(snapshot, recent.code, "52w", true);
    expect(getRadarChart(snapshot, recent.code, "52w")).toBeNull();
    expect(chart?.points.map(point => point.date)).toEqual([
      "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", end,
    ]);
    expect(getRadarChart(snapshot, "999999", "52w", true)).toBeNull();
  });
});
