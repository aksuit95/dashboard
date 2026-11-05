import { metricLabels, type Evidence, type FinancialReport, type Metric } from "./types";

export type DartAccount = { rcept_no: string; reprt_code: string; bsns_year: string; corp_code: string; sj_div: string; account_id: string; account_nm: string; thstrm_amount?: string; thstrm_add_amount?: string; currency: string };
type Mapping = { sj: string[]; ids: string[]; names: string[] };
const bs = (ids: string[], names: string[]): Mapping => ({ sj: ["BS"], ids, names });
const cf = (ids: string[], names: string[]): Mapping => ({ sj: ["CF"], ids, names });
const income = (ids: string[], names: string[]): Mapping => ({ sj: ["IS", "CIS"], ids, names });
export const mappings: Record<Metric, Mapping> = {
  cash: bs(["CashAndCashEquivalents"], ["현금및현금성자산"]),
  shortInvestments: bs(["ShorttermDepositsNotClassifiedAsCashEquivalents"], ["단기금융상품", "단기금융예치금"]),
  currentAssets: bs(["CurrentAssets"], ["유동자산"]), currentLiabilities: bs(["CurrentLiabilities"], ["유동부채"]),
  inventory: bs(["Inventories"], ["재고자산"]), receivables: bs(["CurrentTradeReceivables"], ["매출채권"]),
  liabilities: bs(["Liabilities"], ["부채총계"]), equity: bs(["Equity"], ["자본총계"]),
  shortDebt: bs(["ShorttermBorrowings"], ["단기차입금"]),
  currentLongDebt: bs(["CurrentPortionOfLongtermBorrowings"], ["유동성장기부채", "유동성장기차입금"]),
  longDebt: bs(["NoncurrentPortionOfNoncurrentLoansReceived", "LongtermBorrowings"], ["장기차입금"]),
  bonds: bs(["NoncurrentPortionOfNoncurrentBondsIssued"], ["사채", "비유동사채"]),
  currentBonds: bs(["CurrentPortionOfNoncurrentBondsIssued"], ["유동성사채", "유동사채"]),
  currentLeases: bs(["CurrentLeaseLiabilities"], ["유동리스부채", "단기리스부채"]),
  longLeases: bs(["NoncurrentLeaseLiabilities"], ["비유동리스부채", "장기리스부채"]),
  revenue: income(["Revenue"], ["매출액", "수익(매출액)", "영업수익"]),
  profit: income(["ProfitLoss"], ["당기순이익", "당기순이익(손실)", "반기순이익(손실)", "분기순이익(손실)"]),
  operatingProfit: income(["OperatingIncomeLoss"], ["영업이익", "영업이익(손실)"]), interest: income(["InterestExpense"], ["이자비용"]),
  ocf: cf(["CashFlowsFromUsedInOperatingActivities"], ["영업활동현금흐름", "영업활동으로인한현금흐름"]),
  ppe: cf(["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"], ["유형자산의취득", "유형자산취득"]),
  intangible: cf(["PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities"], ["무형자산의취득", "무형자산취득"]),
  dividends: cf(["DividendsPaidClassifiedAsFinancingActivities", "DividendsPaidClassifiedAsOperatingActivities"], ["배당금의지급", "배당금지급", "배당금의지급액"]),
  buybacks: cf(["AcquisitionOfTreasuryShares", "PurchaseOfTreasuryShares"], ["자기주식의취득", "자기주식취득"]),
  icf: cf(["CashFlowsFromUsedInInvestingActivities"], ["투자활동현금흐름", "투자활동으로인한현금흐름"]),
  financing: cf(["CashFlowsFromUsedInFinancingActivities"], ["재무활동현금흐름", "재무활동으로인한현금흐름"]),
  fx: cf(["EffectOfExchangeRateChangesOnCashAndCashEquivalents"], ["환율변동효과", "외화환산으로인한현금의변동"]),
  openingCash: cf(["CashAndCashEquivalentsAtBeginningOfPeriodCf"], ["기초의현금및현금성자산", "기초현금및현금성자산"]),
  endingCash: cf(["CashAndCashEquivalentsAtEndOfPeriodCf"], ["기말의현금및현금성자산", "기말현금및현금성자산"]),
  acquisitions: cf(["CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities"], ["사업결합으로인한순현금유출액"]),
  assetSales: cf(["ProceedsFromSalesOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"], ["유형자산의처분", "유형자산처분"]),
};
const normal = (s: string) => s.replace(/[\s,·ㆍ]/g, "");
export function parseAmount(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replaceAll(",", "");
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
const outflows = new Set<Metric>(["ppe", "intangible", "dividends", "buybacks", "acquisitions", "interest"]);
/** Holding company code 64992 covers industrial as well as financial groups. */
export function classifyFinancial(industryCode: string, industryName: string): boolean | null {
  if (/은행|증권|보험|카드|금융/.test(industryName)) return true;
  if (industryCode === "64992") return industryName && industryName !== "미확인" ? false : null;
  if (/^(64|65|66)/.test(industryCode)) return true;
  return /^\d{2,6}$/.test(industryCode) ? false : null;
}
export function parseFinancialReport(rows: DartAccount[], input: { corpCode: string; year: number; quarter: 1 | 2 | 3 | 4; scope: "CFS" | "OFS"; now: Date }): FinancialReport {
  const codes = { 1: "11013", 2: "11012", 3: "11014", 4: "11011" };
  const receipt = rows[0]?.rcept_no;
  if (!rows.length || !/^\d{14}$/.test(receipt) || rows.some(r => r.corp_code !== input.corpCode || r.bsns_year !== String(input.year) || r.reprt_code !== codes[input.quarter] || r.rcept_no !== receipt)) throw new Error("DART 재무제표 회사·기간·접수번호 불일치");
  if (rows.some(r => ["BS", "CF", "IS", "CIS"].includes(r.sj_div) && r.currency !== "KRW")) throw new Error("원화 외 재무제표는 환산 검증이 필요합니다.");
  const filedAt = `${receipt.slice(0, 4)}-${receipt.slice(4, 6)}-${receipt.slice(6, 8)}`;
  if (filedAt > new Date(input.now.getTime() + 9 * 3600000).toISOString().slice(0, 10)) throw new Error("미래 공시가 응답에 포함됐습니다.");
  const values = {} as FinancialReport["values"], evidence: FinancialReport["evidence"] = {}, warnings: string[] = [];
  for (const metric of Object.keys(metricLabels) as Metric[]) {
    const map = mappings[metric];
    const candidates = rows.filter(r => map.sj.includes(r.sj_div));
    const byId = candidates.filter(r => map.ids.includes(r.account_id.replace(/^(ifrs-full|ifrs|dart)_/, "")));
    let found = byId.length ? byId : candidates.filter(r => map.names.some(n => normal(n) === normal(r.account_nm)));
    // IS and CIS can repeat the same profit. Prefer IS; conflicting rows remain missing.
    if (found.some(r => r.sj_div === "IS")) found = found.filter(r => r.sj_div === "IS");
    const matched = found.map(row => {
      // DART CF is YTD already. Only interim IS/CIS requires add_amount (never 3-month fallback).
      const field = input.quarter !== 4 && ["IS", "CIS"].includes(row.sj_div) ? "thstrm_add_amount" : "thstrm_amount";
      const value = parseAmount(row[field]);
      const ev: Evidence = { id: row.account_id, name: row.account_nm, statement: row.sj_div, field, raw: row[field] ?? "" };
      return { value: value != null && outflows.has(metric) ? Math.abs(value) : value, ev };
    });
    evidence[metric] = matched.map(m => m.ev);
    const distinct = new Set(matched.map(m => m.value));
    values[metric] = matched.length && distinct.size === 1 ? matched[0].value : null;
    if (distinct.size > 1) warnings.push(`${metricLabels[metric]}: 중복 계정 금액 상충`);
  }
  const periodEnd = `${input.year}-${["03-31", "06-30", "09-30", "12-31"][input.quarter - 1]}`;
  const { openingCash: begin, endingCash: end, ocf, icf, financing, fx, cash } = values;
  if ([begin, end, ocf, icf, financing, fx].every(v => v != null)) {
    const diff = end! - (begin! + ocf! + icf! + financing! + fx!);
    if (Math.abs(diff) > Math.max(1, Math.abs(end!) * 1e-8)) warnings.push(`현금흐름표 조정 불일치: ${Math.round(diff)}원 · 기타 변동 원문 확인`);
  } else warnings.push("현금흐름표 조정 검증에 필요한 계정 일부 누락");
  if (end != null && cash != null && Math.abs(end - cash) > Math.max(1, Math.abs(cash) * 1e-8)) warnings.push("재무상태표·현금흐름표 현금 잔액 불일치");
  return { year: input.year, quarter: input.quarter, periodEnd, reportCode: codes[input.quarter], scope: input.scope, receipt, filedAt, fetchedAt: input.now.toISOString(), currency: "KRW", values, evidence, warnings };
}
