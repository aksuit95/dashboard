import { metricLabels, type FinancialCompany, type FinancialReport, type FlowSummary, type Metric } from "./types";

export const completeSum = (...values: (number | null)[]): number | null => values.every(v => v != null) ? values.reduce<number>((s, v) => s + v!, 0) : null;
export const ratio = (a: number | null, b: number | null, scale = 1) => a != null && b != null && b > 0 ? a / b * scale : null;
export function flowSummary(reports: FinancialReport[], end?: FinancialReport): FlowSummary | null {
  const latest = end ?? [...reports].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  if (!latest) return null;
  let values = { ...latest.values };
  if (latest.quarter !== 4) {
    const annual = reports.find(r => r.year === latest.year - 1 && r.quarter === 4 && r.scope === latest.scope);
    const prior = reports.find(r => r.year === latest.year - 1 && r.quarter === latest.quarter && r.scope === latest.scope);
    if (!annual || !prior) return null;
    values = Object.fromEntries((Object.keys(metricLabels) as Metric[]).map(k => {
      const current = latest.values[k], full = annual.values[k], previous = prior.values[k];
      return [k, current != null && full != null && previous != null ? full + current - previous : null];
    })) as FinancialReport["values"];
  }
  const capex = completeSum(values.ppe, values.intangible);
  return { periodEnd: latest.periodEnd, label: latest.quarter === 4 ? `${latest.year} 연간` : `${latest.periodEnd} TTM`, scope: latest.scope, values, capex, fcf: completeSum(values.ocf, capex == null ? null : -capex) };
}

/** Derive discrete quarters from successive YTD statements; never mix scopes. */
export function discreteQuarters(reports: FinancialReport[]) {
  return [...reports].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).map(r => {
    const previous = reports.find(p => p.year === r.year && p.quarter === r.quarter - 1 && p.scope === r.scope);
    const subtract = (key: Metric) => r.quarter === 1 ? r.values[key] : r.values[key] != null && previous?.values[key] != null ? r.values[key]! - previous.values[key]! : null;
    const ocf = subtract("ocf"), capex = completeSum(subtract("ppe"), subtract("intangible"));
    return { period: `${r.year} Q${r.quarter}`, scope: r.scope, ocf, capex, fcf: completeSum(ocf, capex == null ? null : -capex) };
  });
}

export function analyzeCompany(company: FinancialCompany) {
  const reports = [...company.reports].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latest = reports[0] ?? null;
  const v = latest?.values;
  const ttm = company.financial === false ? flowSummary(reports) : null;
  const annual = reports.filter(r => r.quarter === 4 && r.scope === latest?.scope).slice(0, 5).map(r => flowSummary(reports, r)!);
  const comparableAnnual = annual.filter(r => r.scope === latest?.scope);
  const last3 = comparableAnnual.slice(0, 3);
  const lastAnnualYear = latest ? latest.year - (latest.quarter === 4 ? 0 : 1) : null;
  const consecutive = last3.length === 3 && last3.every((r, i) => Number(r.periodEnd.slice(0, 4)) === lastAnnualYear! - i);
  const averageFcf = consecutive ? ratio(completeSum(...last3.map(r => r.fcf)), 3) : null;
  // Sum only non-overlapping, separately disclosed loan/bond buckets. This is not a verified total:
  // embedded lease debt, current bonds within currentLongDebt and note-only financing remain unknown.
  const debtKeys: Metric[] = ["shortDebt", "currentLongDebt", "longDebt", "bonds"];
  const knownDebt = v ? debtKeys.flatMap(k => {
    if (v[k] == null) return [];
    // A generic "사채" balance may include current bonds already in another line.
    // Include it only if the source explicitly identifies the noncurrent portion.
    if (k === "bonds" && !latest?.evidence.bonds?.some(e => /NoncurrentPortionOfNoncurrentBondsIssued/.test(e.id) || /비유동사채/.test(e.name.replace(/\s/g, "")))) return [];
    return [v[k]!];
  }) : [];
  const reportedDebt = company.financial === false && knownDebt.length ? knownDebt.reduce((s, n) => s + n, 0) : null;
  const reportedCurrentDebt = v ? completeSum(v.shortDebt, v.currentLongDebt) : null;
  const signals: { severity: "warning" | "info"; text: string }[] = [];
  if (company.financial !== false) signals.push({ severity: "info", text: company.financial ? "금융업: 일반기업 FCF·유동성 순위 제외. 자본적정성·LCR·지급여력은 별도 공시 확인 필요" : "업종 미확인: 일반기업 평가 보류" });
  if (company.financial === false) {
    if (ttm?.fcf != null && ttm.fcf < 0) signals.push({ severity: "warning", text: `${ttm.label} FCF 적자 ${Math.round(ttm.fcf / 1e8).toLocaleString("ko-KR")}억원` });
    if (consecutive && last3.every(r => r.fcf != null && r.fcf < 0)) signals.push({ severity: "warning", text: `최근 3개 연도 FCF 연속 적자 (${last3.at(-1)!.periodEnd.slice(0, 4)}~${last3[0].periodEnd.slice(0, 4)})` });
    const payout = ttm ? completeSum(ttm.values.dividends, ttm.values.buybacks) : null;
    if (payout != null && ttm?.fcf != null && payout > ttm.fcf) signals.push({ severity: "warning", text: "TTM 배당·자사주 취득액이 FCF를 초과" });
    if (v?.cash != null && reportedCurrentDebt != null && reportedCurrentDebt > v.cash) signals.push({ severity: "warning", text: "표기된 단기차입금·유동성장기부채가 현금 잔액 초과 (금융상품 유동성 미검증)" });
    const previous = reports.find(r => r.year === latest!.year - 1 && r.quarter === latest!.quarter && r.scope === latest!.scope);
    if (previous && v) {
      const priorTtm = flowSummary(reports, previous);
      if (ttm?.values.profit != null && priorTtm?.values.profit != null && ttm.values.ocf != null && priorTtm.values.ocf != null && ttm.values.profit > priorTtm.values.profit && ttm.values.ocf < priorTtm.values.ocf) signals.push({ severity: "warning", text: "전년 동기 TTM 대비 순이익 증가·영업현금흐름 감소" });
      if (v.cash != null && previous.values.cash != null && v.shortDebt != null && previous.values.shortDebt != null && v.cash < previous.values.cash && v.shortDebt > previous.values.shortDebt) signals.push({ severity: "warning", text: "전년 동기 대비 현금 감소·단기차입금 증가" });
      if (v.inventory != null && previous.values.inventory != null && v.inventory > previous.values.inventory) signals.push({ severity: "info", text: "전년 동기 대비 재고 증가: 운전자본·계절성 확인" });
    }
  }
  if (latest) signals.push(...latest.warnings.map(text => ({ severity: "info" as const, text })));
  const residual = ttm ? completeSum(ttm.fcf, ttm.values.dividends == null ? null : -ttm.values.dividends, ttm.values.buybacks == null ? null : -ttm.values.buybacks) : null;
  const yieldValue = company.financial === false && company.market ? ratio(ttm?.fcf ?? null, company.market.marketCap, 100) : null;
  return {
    latest, ttm, annual, averageFcf, reportedDebt, reportedCurrentDebt,
    // Not a certified net cash measure. Do not use for safe/unsafe or net-cash rankings.
    cashLessReportedDebt: v?.cash != null && reportedDebt != null ? v.cash - reportedDebt : null,
    availableLiquidity: null, totalDebt: null, netCash: null,
    currentRatio: company.financial === false && v ? ratio(v.currentAssets, v.currentLiabilities, 100) : null,
    quickRatio: company.financial === false && v ? ratio(completeSum(v.currentAssets, v.inventory == null ? null : -v.inventory), v.currentLiabilities, 100) : null,
    fcfMargin: ttm ? ratio(ttm.fcf, ttm.values.revenue, 100) : null,
    cashConversion: ttm ? ratio(ttm.values.ocf, ttm.values.profit) : null,
    interestCoverage: ttm ? ratio(ttm.values.operatingProfit, ttm.values.interest) : null,
    debtToOcf: ttm ? ratio(reportedDebt, ttm.values.ocf) : null,
    fcfYield: yieldValue, residual,
    profitableYears: comparableAnnual.filter(r => r.fcf != null && r.fcf > 0).length,
    coveredYears: comparableAnnual.filter(r => r.fcf != null).length,
    signals,
  };
}
