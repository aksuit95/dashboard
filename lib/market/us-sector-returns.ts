import type { Returns } from "./sector-returns";

export type UsReturnRow = {
  code: string;
  name: string;
  sector: string;
  industry: string;
  membership: string;
  price: number | null;
  marketCap?: number | null;
  sectorCapEligible?: boolean;
  returns: Returns & { "3d"?: number | null };
};

export type UsSectorBoard = {
  asOf: string;
  requestedDate: string | null;
  latestDate: string;
  dates: string[];
  fetchedAt: string;
  rows: UsReturnRow[];
  indexDaily: { change: number; previousDate: string } | null;
};

export const usUniverseName = "S&P 500 + NASDAQ 100";
export const usRegularClose = "미국 정규장 종가 · 뉴욕 거래일(ET)";
export const usStockUrl = (code: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(code.replace(".", "-"))}/`;
