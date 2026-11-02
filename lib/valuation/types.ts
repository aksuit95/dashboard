export type ValuationPoint = { date: string; value: number };
export type ValuationSeries = {
  id: string;
  name: string;
  unit: string;
  digits: number;
  color: string;
  sheet: string;
  itemCode: string;
  points: ValuationPoint[];
};
export type ValuationData = {
  fileName: string;
  savedAt: string;
  sourceUpdatedAt: string | null;
  series: ValuationSeries[];
  warnings: string[];
};
