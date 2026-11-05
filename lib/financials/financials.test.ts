import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeCompany, defaultForecast, discreteQuarters, flowSummary, forecastCash, ratio, type ForecastInputs } from "./analyze";
import { classifyFinancial, parseAmount, parseFinancialReport, type DartAccount } from "./parse";
import { applyFinancialMarketCaps, atomicJson, dartRequest, readFinancialPublication } from "./source";
import { metricLabels, type FinancialCompany, type FinancialReport, type Metric } from "./types";

const now = new Date("2026-11-04T12:00:00+09:00");
function row(id: string, name: string, sj: string, amount: string, extra: Partial<DartAccount> = {}): DartAccount {
  return { rcept_no: "20260814000001", bsns_year: "2026", reprt_code: "11012", corp_code: "00126380", sj_div: sj, account_id: `ifrs-full_${id}`, account_nm: name, thstrm_amount: amount, currency: "KRW", ...extra };
}
function parse(rows: DartAccount[]) { return parseFinancialReport(rows, { corpCode: "00126380", year: 2026, quarter: 2, scope: "CFS", now }); }
function report(year: number, quarter: 1 | 2 | 3 | 4, partial: Partial<Record<Metric, number | null>>, scope: "CFS" | "OFS" = "CFS"): FinancialReport {
  return { year, quarter, periodEnd: `${year}-${["03-31", "06-30", "09-30", "12-31"][quarter - 1]}`, scope, receipt: "20260814000001", filedAt: "2026-08-14", fetchedAt: now.toISOString(), currency: "KRW", reportCode: "11012", values: { ...Object.fromEntries(Object.keys(metricLabels).map(k => [k, null])), ...partial } as FinancialReport["values"], evidence: {}, warnings: [] };
}
function company(reports: FinancialReport[], financial: boolean | null = false): FinancialCompany {
  return { code: "005930", name: "테스트", corpCode: "00126380", industry: "제조업", financial, fiscalMonth: "12", reports, errors: [], attemptedAt: now.toISOString(), referenceFcf: null, market: null };
}
const inputs: ForecastInputs = { ocf: 100, capex: 30, dividends: 10, buybacks: 0, repayments: 20, newBorrowing: 0, assetSales: 0, acquisitions: 0, financialAssetNet: -5, other: 0 };
it("공통 KRX 시총을 재무 자료에 적용하고 자료가 없으면 이전 가격을 사용하지 않는다", () => {
  const publication = { schemaVersion: 1 as const, publishedAt: now.toISOString(), membershipAt: now.toISOString(), membershipSource: "test", companies: [{ ...company([]), market: { date: "2026-11-02", exchange: "KRX" as const, priceTime: "15:30" as const, close: 80, marketCap: 800, fetchedAt: now.toISOString() } }] };
  const caps = { version: 1 as const, source: "KRX_WEB_VERIFIED" as const, asOf: "2026-11-03", fetchedAt: now.toISOString(), exchange: "KRX" as const, priceTime: "15:30 KST" as const, priceBasis: "KRX_REGULAR_CLOSE" as const, values: { "005930": 1000 }, closes: { "005930": 100 } };
  expect(applyFinancialMarketCaps(publication, caps).companies[0].market).toMatchObject({ date: "2026-11-03", close: 100, marketCap: 1000 });
  expect(applyFinancialMarketCaps(publication, null).companies[0].market).toBeNull();
});
afterEach(() => vi.unstubAllEnvs());
describe("DART 계정과 누적 기간", () => {
  it("결측을 0으로 만들지 않고 실제 0은 보존", () => {
    expect(parseAmount("-")).toBeNull(); expect(parseAmount("")).toBeNull(); expect(parseAmount("0")).toBe(0); expect(parseAmount("-1,200")).toBe(-1200);
  });
  it("BS 현금과 CF 기말 현금을 섞지 않고 CF는 누적 금액 사용", () => {
    const r = parse([row("CashAndCashEquivalents", "현금및현금성자산", "BS", "200"), row("CashFlowsFromUsedInOperatingActivities", "영업활동현금흐름", "CF", "90", { thstrm_add_amount: "999" })]);
    expect(r.values.cash).toBe(200); expect(r.values.ocf).toBe(90); expect(r.values.buybacks).toBeNull();
  });
  it("분기 손익은 3개월 금액 대신 누적 필드 사용, 누적 없으면 결측", () => {
    const r = parse([row("Revenue", "매출액", "IS", "50", { thstrm_add_amount: "95" }), row("ProfitLoss", "당기순이익", "IS", "10")]);
    expect(r.values.revenue).toBe(95); expect(r.values.profit).toBeNull();
  });
  it("CAPEX 유출 부호 정규화, 인수대금은 CAPEX와 분리", () => {
    const r = parse([row("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "유형자산의 취득", "CF", "-30"), row("CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities", "사업결합", "CF", "20")]);
    expect(r.values.ppe).toBe(30); expect(r.values.acquisitions).toBe(20); expect(r.values.intangible).toBeNull();
  });
  it("표준 ID 우선, 이름 부분 일치와 상충 중복은 계산 제외", () => {
    const r = parse([row("Unknown", "현금및현금성자산증가", "BS", "888"), row("CashAndCashEquivalents", "현금", "BS", "30"), row("CashAndCashEquivalents", "현금", "BS", "40")]);
    expect(r.values.cash).toBeNull(); expect(r.warnings.some(w => w.includes("상충"))).toBe(true);
  });
  it("다른 회사·통화·미래 공시는 거절", () => {
    expect(() => parse([row("CashAndCashEquivalents", "현금", "BS", "10", { corp_code: "99999999" })])).toThrow("불일치");
    expect(() => parse([row("CashAndCashEquivalents", "현금", "BS", "10", { currency: "USD" })])).toThrow("환산");
    expect(() => parse([row("CashAndCashEquivalents", "현금", "BS", "10", { rcept_no: "20261105000001" })])).toThrow("미래");
  });
  it("기초+OCF+ICF+재무+환율과 기말 현금 조정 검증", () => {
    const r = parse([row("CashAndCashEquivalentsAtBeginningOfPeriodCf", "기초", "CF", "100"), row("CashAndCashEquivalentsAtEndOfPeriodCf", "기말", "CF", "120"), row("CashFlowsFromUsedInOperatingActivities", "OCF", "CF", "50"), row("CashFlowsFromUsedInInvestingActivities", "ICF", "CF", "-30"), row("CashFlowsFromUsedInFinancingActivities", "재무", "CF", "-5"), row("EffectOfExchangeRateChangesOnCashAndCashEquivalents", "환율", "CF", "5")]);
    expect(r.warnings).toEqual([]);
  });
});
describe("FCF·금융업·결측 처리", () => {
  it("같은 지주회사 코드라도 산업 지주와 금융 지주를 분리", () => {
    expect(classifyFinancial("64992", "석유와가스")).toBe(false);
    expect(classifyFinancial("64992", "복합기업")).toBe(false);
    expect(classifyFinancial("64992", "은행")).toBe(true);
    expect(classifyFinancial("64992", "미확인")).toBeNull();
    expect(classifyFinancial("65121", "손해보험")).toBe(true);
  });
  const reports = [report(2025, 4, { ocf: 100, ppe: 30, intangible: 10 }), report(2025, 2, { ocf: 40, ppe: 10, intangible: 5 }), report(2026, 2, { ocf: 60, ppe: 20, intangible: 8 })];
  it("TTM = 전년 연간 + 당기 누적 - 전년 동기 누적", () => { const t = flowSummary(reports)!; expect(t.values.ocf).toBe(120); expect(t.capex).toBe(53); expect(t.fcf).toBe(67); });
  it("전년 동기나 CAPEX 일부가 없으면 추정해서 채우지 않음", () => {
    expect(flowSummary(reports.slice(0, 1).concat(reports[2]))).toBeNull();
    const r = report(2025, 4, { ocf: 100, ppe: 20 }); expect(flowSummary([r])!.fcf).toBeNull();
  });
  it("연결·별도 혼합 금지", () => { expect(flowSummary([reports[0], { ...reports[1], scope: "OFS" }, reports[2]])).toBeNull(); });
  it("단일 분기는 누적 차감, 직전 분기 없으면 결측", () => {
    const q = discreteQuarters([report(2026, 1, { ocf: 20, ppe: 5, intangible: 1 }), report(2026, 2, { ocf: 50, ppe: 12, intangible: 3 }), report(2026, 4, { ocf: 100, ppe: 20, intangible: 5 })]);
    expect(q[1].ocf).toBe(30); expect(q[1].fcf).toBe(21); expect(q[2].fcf).toBeNull();
  });
  it("금융업·미분류는 FCF 평가와 예측 기본값 제외", () => {
    for (const financial of [true, null]) { expect(analyzeCompany(company(reports, financial)).ttm).toBeNull(); expect(defaultForecast(company(reports, financial)).ocf).toBeNull(); }
  });
  it("차입금 누락을 순현금으로 해석하지 않음, 분모 음수는 비율 제외", () => {
    const a = analyzeCompany(company([report(2025, 4, { cash: 200, shortDebt: 10 })]));
    expect(a.reportedDebt).toBe(10); expect(a.netCash).toBeNull(); expect(a.totalDebt).toBeNull(); expect(a.availableLiquidity).toBeNull(); expect(ratio(30, -10)).toBeNull();
  });
  it("3년 평균은 3개 연도 전부 필요", () => { expect(analyzeCompany(company(reports)).averageFcf).toBeNull(); });
  it("연도가 건너뛴 3개 실적을 최근 3년 평균으로 표시하지 않음", () => {
    const r = [2021, 2023, 2025].map(year => report(year, 4, { ocf: 100, ppe: 20, intangible: 5 }));
    expect(analyzeCompany(company(r)).averageFcf).toBeNull();
  });
});
describe("현금 시나리오", () => {
  it("상환과 금융상품 이동을 반영하며 부족액을 음수로 보존", () => {
    const r = forecastCash(100, inputs); expect(r.cash12).toBe(135); expect(r.cash24).toBe(170);
    const deficit = forecastCash(5, { ...inputs, ocf: -100 }); expect(deficit.cash12).toBe(-160); expect(deficit.gap12).toBe(160);
  });
  it("모르는 상환액을 자동 0으로 바꾸지 않음", () => { const r = forecastCash(100, { ...inputs, repayments: null }); expect(r.cash12).toBeNull(); expect(r.missing).toContain("repayments"); });
  it("OCF 적자에서도 보수 시나리오가 더 나쁨", () => {
    const p = { ...inputs, ocf: -100 }; expect(forecastCash(100, p, "bear").cash12!).toBeLessThan(forecastCash(100, p, "base").cash12!); expect(forecastCash(100, p, "bull").cash12!).toBeGreaterThan(forecastCash(100, p, "base").cash12!);
  });
  it("음수 지출·무한대는 거절", () => { expect(forecastCash(100, { ...inputs, capex: -1 }).cash12).toBeNull(); expect(forecastCash(100, { ...inputs, ocf: Infinity }).cash12).toBeNull(); });
});
describe("API 보안·저장", () => {
  it("오류에 API 키·요청 URL을 노출하지 않음", async () => {
    vi.stubEnv("DART_API_KEY", "SECRET_FINANCIAL_TEST_KEY");
    const fake = vi.fn(async () => { throw new Error("https://example?key=SECRET_FINANCIAL_TEST_KEY"); }) as unknown as typeof fetch;
    await expect(dartRequest("company.json", { corp_code: "00126380" }, fake)).rejects.toThrow("네트워크 연결 실패");
  });
  it("KRX 가격 기준이 손상된 배포 파일 거절", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "financials-test-")); const file = path.join(directory, "board.json");
    try {
      await atomicJson(file, { schemaVersion: 1, publishedAt: now.toISOString(), membershipAt: now.toISOString(), companies: [{ ...company([]), market: { date: "2026-11-03", exchange: "NXT", priceTime: "20:00", close: 100, marketCap: 1000 } }] });
      await expect(readFinancialPublication(file)).rejects.toThrow("KRX 가격 기준");
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});
