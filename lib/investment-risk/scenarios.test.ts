import { describe, expect, it } from "vitest";
import type { FinancialCompany, FinancialReport } from "@/lib/financials/types";
import { capitalScenario, priceThreshold, warningRules, dangerRules, type TradedClose } from "./scenarios";

const dates = Array.from({ length: 15 }, (_, i) => String(i));
const flat = (): TradedClose[] => dates.map(() => [1000, 100]);
describe("다음 거래일 급등 기준", () => {
  it("T-3·T-5·T-15를 현재 거래일이 아닌 다음 거래일 기준으로 선택한다", () => {
    const prices: TradedClose[] = dates.map((_, i) => [1000 + 10 * i, 100]);
    expect(priceThreshold(dates, prices, dangerRules[0])).toMatchObject({ baseDate: "12", base: 1120, minimum: 1624 });
    expect(priceThreshold(dates, prices, warningRules[0])).toMatchObject({ baseDate: "10", base: 1100, minimum: 1760 });
    expect(priceThreshold(dates, prices, warningRules[1])).toMatchObject({ baseDate: "0", base: 1000, minimum: 2000 });
  });

  it("다음 거래일 15일 최고 종가 조건을 적용하고 기간 밖 최고가는 제외한다", () => {
    const prices = flat();
    prices[0] = [9000, 100];
    prices[1] = [1800, 100];
    prices[14] = [1500, 100];
    expect(priceThreshold(dates, prices, warningRules[0])).toMatchObject({ high: 1800, minimum: 1800, gapPct: 20 });
  });

  it("중간 결측과 상장주식수 변동이 있으면 건너뛰지 않는다", () => {
    const missing: (TradedClose | undefined)[] = flat();
    missing[8] = undefined;
    expect(priceThreshold(dates, missing, warningRules[0])).toBeNull();
    const changed = flat();
    changed[8] = [1000, 101];
    expect(priceThreshold(dates, changed, warningRules[0])).toBeNull();
  });
});

function report(quarter: 2 | 3, profit: string) {
  return {
    year: 2026, quarter, periodEnd: quarter === 2 ? "2026-06-30" : "2026-09-30", scope: "CFS",
    values: { equity: 99999, profit: 99999 },
    accounts: [
      { statement: "BS", currency: "KRW", id: "ifrs-full_IssuedCapital", amount: "1000" },
      { statement: "BS", currency: "KRW", id: "ifrs-full_EquityAttributableToOwnersOfParent", amount: "600" },
      { statement: "IS", currency: "KRW", id: "ifrs-full_ProfitLossAttributableToOwnersOfParent", amount: profit },
    ],
  } as FinancialReport;
}

describe("같은 분기 손실 반복", () => {
  it("지배기업 지분만 사용하고 누적 손익에서 직전 누적을 차감한다", () => {
    const company = { reports: [report(2, "-300"), report(3, "-420")] } as FinancialCompany;
    expect(capitalScenario(company)).toMatchObject({ equity: 600, capital: 1000, repeatLoss: 120, room: 100, projectedPct: 52 });
  });
  it("직전 누적 공시가 빠지면 반복 손실 시나리오를 비운다", () => {
    const company = { reports: [report(3, "-420")] } as FinancialCompany;
    expect(capitalScenario(company)).toMatchObject({ room: 100, repeatLoss: null, projectedPct: null });
  });
});
