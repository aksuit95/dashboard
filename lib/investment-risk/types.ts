import type { capitalScenario, priceThreshold } from "./scenarios";

type Threshold = NonNullable<ReturnType<typeof priceThreshold>>;
export type PriceCandidate = {
  code: string; name: string; market: "KOSPI" | "KOSDAQ"; close: number;
  warning: Threshold[]; danger: Threshold[];
};
export type FinancialCandidate = NonNullable<ReturnType<typeof capitalScenario>> & { code: string; name: string };
export type RiskOutlook = {
  price: { asOf: string; expectedAsOf: string | null; fetchedAt: string; covered: number; total: number; rows: PriceCandidate[] } | null;
  financial: { covered: number; total: number; rows: FinancialCandidate[] } | null;
};
