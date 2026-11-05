export const metricLabels = {
  cash: "현금및현금성자산", shortInvestments: "단기금융상품", currentAssets: "유동자산", currentLiabilities: "유동부채",
  inventory: "재고자산", receivables: "매출채권", liabilities: "부채총계", equity: "자본총계",
  shortDebt: "단기차입금", currentLongDebt: "유동성장기부채", longDebt: "장기차입금", bonds: "사채(만기 확인 필요)",
  currentBonds: "유동 사채", currentLeases: "유동 리스부채", longLeases: "비유동 리스부채",
  revenue: "매출액", profit: "당기순이익", operatingProfit: "영업이익", interest: "이자비용",
  ocf: "영업현금흐름", ppe: "유형자산 취득", intangible: "무형자산 취득", dividends: "현금 배당 지급", buybacks: "자사주 취득",
  icf: "투자현금흐름", financing: "재무현금흐름", fx: "현금 환율효과", openingCash: "기초 현금", endingCash: "기말 현금",
  acquisitions: "사업결합 현금흐름(원문)", assetSales: "유형자산 매각 유입",
} as const;
export type Metric = keyof typeof metricLabels;
export type Evidence = { id: string; name: string; statement: string; field: string; raw: string };
export type DisclosedAccount = { id: string; name: string; statement: string; amount: string; currency: string };
export type FinancialReport = {
  year: number; quarter: 1 | 2 | 3 | 4; periodEnd: string; reportCode: string; scope: "CFS" | "OFS";
  receipt: string; filedAt: string; fetchedAt: string; currency: "KRW";
  values: Record<Metric, number | null>; evidence: Partial<Record<Metric, Evidence[]>>; warnings: string[];
  accounts?: DisclosedAccount[];
};
export type FinancialCompany = {
  code: string; name: string; corpCode: string | null; industry: string; financial: boolean | null;
  industryCode?: string; financialBasis?: string;
  fiscalMonth: string | null; reports: FinancialReport[]; errors: string[]; attemptedAt: string | null;
  referenceFcf: { value: number | null; source: string; compositionDate: string; sourceUpdatedAt: string | null; definition: string } | null;
  market: { date: string; exchange: "KRX"; priceTime: "15:30"; close: number; marketCap: number; fetchedAt: string } | null;
};
export type FinancialPublication = {
  schemaVersion: 1; publishedAt: string; membershipAt: string; membershipSource: string; companies: FinancialCompany[];
};
export type FinancialBoard = { publication: FinancialPublication | null; error: string | null; readAt: string };
export type FlowSummary = { periodEnd: string; label: string; scope: "CFS" | "OFS"; values: Record<Metric, number | null>; capex: number | null; fcf: number | null };
