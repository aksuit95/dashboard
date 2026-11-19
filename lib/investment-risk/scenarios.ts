import type { FinancialCompany, FinancialMarket, FinancialReport } from "@/lib/financials/types";
import { parseAmount } from "@/lib/financials/parse";

export type PriceRule = { days: 3 | 5 | 15; rise: number; indexMultiple: number };
export const warningRules: PriceRule[] = [{ days: 5, rise: 60, indexMultiple: 5 }, { days: 15, rise: 100, indexMultiple: 3 }];
export const dangerRules: PriceRule[] = [{ days: 3, rise: 45, indexMultiple: 5 }, { days: 5, rise: 60, indexMultiple: 5 }];
export type TradedClose = [close: number, listedShares: number];
export const priceWindowLength = 15;

/** closes end on S. The hypothetical judgment day T is the next session (S+1). */
export function priceThreshold(dates: string[], closes: (TradedClose | undefined)[], rule: PriceRule) {
  if (dates.length !== priceWindowLength || closes.length !== priceWindowLength) return null;
  const last = closes.at(-1);
  if (!last || closes.some(row => !row || row[1] !== last[1])) return null;
  const baseIndex = dates.length - rule.days;
  const base = closes[baseIndex]![0], current = last[0];
  const high = Math.max(...closes.slice(-14).map(row => row![0]));
  const minimum = Math.max(Math.ceil(base * (100 + rule.rise) / 100), high);
  return {
    ...rule, baseDate: dates[baseIndex], base, high, minimum,
    gapPct: Math.max(0, (minimum - current) / current * 100),
  };
}

function account(report: FinancialReport, id: string, name?: string) {
  const bs = report.accounts?.filter(row => row.statement === "BS" && row.currency === "KRW") ?? [];
  const exact = bs.filter(row => row.id.replace(/^(ifrs-full|ifrs|dart)_/, "") === id);
  const matching = exact.length ? exact : name ? bs.filter(row => row.name.replace(/\s/g, "") === name) : [];
  const values = [...new Set(matching.map(row => parseAmount(row.amount)))];
  return values.length === 1 ? values[0] : null;
}

const kosdaqEquityFloor = 1_000_000_000;

export function capitalScenario(company: FinancialCompany, market: FinancialMarket = "KOSPI") {
  const latest = [...company.reports].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  if (!latest) return null;
  const statedCapital = account(latest, "IssuedCapital", "자본금");
  const capital = statedCapital != null && statedCapital > 0 ? statedCapital : null;
  const equity = latest.scope === "CFS" ? account(latest, "EquityAttributableToOwnersOfParent") : latest.values.equity;
  if (equity == null || (capital == null && market === "KOSPI")) return null;
  const previous = company.reports.find(r => r.year === latest.year && r.quarter === latest.quarter - 1 && r.scope === latest.scope);
  // Use parent-attributable profit, never consolidated profit including minority interests.
  const profit = (r: FinancialReport) => r.scope === "OFS" ? r.values.profit : parentProfit(r);
  const ytd = profit(latest), prior = previous ? profit(previous) : null;
  const quarterProfit = ytd == null ? null : latest.quarter === 1 ? ytd : prior == null ? null : ytd - prior;
  const repeatLoss = quarterProfit != null && quarterProfit < 0 ? -quarterProfit : null;
  const projectedEquity = repeatLoss == null ? null : equity - repeatLoss;
  const room = capital == null ? null : equity - capital / 2;
  const equityFloor = market === "KOSDAQ" ? {
    minimum: kosdaqEquityFloor,
    room: equity - kosdaqEquityFloor,
    currentBelow: equity < kosdaqEquityFloor,
    projectedBelow: projectedEquity == null ? null : projectedEquity < kosdaqEquityFloor,
  } : null;
  return {
    periodEnd: latest.periodEnd, filedAt: latest.filedAt, receipt: latest.receipt, scope: latest.scope,
    capital, equity, room, impairmentPct: capital == null ? null : (1 - equity / capital) * 100, repeatLoss,
    projectedEquity, equityFloor,
    projectedPct: projectedEquity == null || capital == null ? null : (1 - projectedEquity / capital) * 100,
  };
}

function parentProfit(report: FinancialReport) {
  const matches = (report.accounts ?? []).filter(row =>
    (row.statement === "IS" || row.statement === "CIS") && row.currency === "KRW" &&
    row.id.replace(/^(ifrs-full|ifrs|dart)_/, "") === "ProfitLossAttributableToOwnersOfParent");
  const income = matches.filter(row => row.statement === "IS");
  const values = [...new Set((income.length ? income : matches).map(row => parseAmount(row.amount)))];
  return values.length === 1 ? values[0] : null;
}
