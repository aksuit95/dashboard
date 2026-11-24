import { readFile } from "node:fs/promises";
import path from "node:path";
import { krxCloseTime } from "@/config/market-calendar";
import type { IndexDay, Point } from "@/lib/market/market-liquidity";
import type { Dated, FundBalance, FundFlow, MarginLoan, MarketFunds } from "./market-liquidity-kofia";
import type { DerivativeDay } from "./market-liquidity-krx";

export type PublishedSeries<T extends Dated> = { value: T[]; collectedAt: string };
export type LiquidityPublication = {
  version: 1;
  priceBasis: "KRX_REGULAR_CLOSE_1530";
  derivativeSession: "KRX_DAY";
  balance: PublishedSeries<MarketFunds>;
  loans: PublishedSeries<MarginLoan>;
  including: PublishedSeries<FundFlow>;
  excluding: PublishedSeries<FundFlow>;
  principal: PublishedSeries<FundBalance>;
  nav: PublishedSeries<FundBalance>;
  KOSPI: PublishedSeries<IndexDay>;
  KOSDAQ: PublishedSeries<IndexDay>;
  totals: PublishedSeries<DerivativeDay>;
  foreign: PublishedSeries<Point>;
  volatility: PublishedSeries<Point>;
  putCall: PublishedSeries<Point>;
};

export const liquidityPublicationPath = path.join(process.cwd(), "data", "market-liquidity", "board.json");
const fields = {
  balance: ["deposits", "derivativesDeposits", "unpaid", "forcedSale", "forcedSalePct"],
  loans: ["total", "kospi", "kosdaq"],
  including: ["subscriptions", "redemptions", "net"],
  excluding: ["subscriptions", "redemptions", "net"],
  principal: ["value"], nav: ["value"],
  KOSPI: ["close", "turnover", "marketCap"], KOSDAQ: ["close", "turnover", "marketCap"],
  totals: ["openInterest", "optionVolume"], foreign: ["value"], volatility: ["value"], putCall: ["value"],
} as const;

export function validateLiquidityPublication(value: unknown): LiquidityPublication {
  const data = value as LiquidityPublication;
  if (data?.version !== 1 || data.priceBasis !== "KRX_REGULAR_CLOSE_1530" || data.derivativeSession !== "KRX_DAY") {
    throw new Error("배포용 시장지표의 KRX 기준 오류");
  }
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const series = data[key];
    if (!Array.isArray(series?.value) || !series.value.length || !Number.isFinite(Date.parse(series.collectedAt))) {
      throw new Error(`배포용 시장지표 시계열 오류 · ${key}`);
    }
    let previous = "";
    for (const point of series.value) {
      const row = point as unknown as Record<string, unknown>;
      const date = point?.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= previous || date > series.collectedAt.slice(0, 10)) {
        throw new Error(`배포용 시장지표 기준일 오류 · ${key}`);
      }
      if ((key === "KOSPI" || key === "KOSDAQ") && (krxCloseTime(date) !== "15:30" || (row.close as number) <= 0)) {
        throw new Error(`배포용 시장지표 정규장 종가 오류 · ${key}`);
      }
      if (fields[key].some(field => !(field === "forcedSalePct" && row[field] === null) && !Number.isFinite(row[field]))) {
        throw new Error(`배포용 시장지표 금액·수량 오류 · ${key}`);
      }
      previous = date;
    }
  }
  return data;
}

export function readLiquidityPublication(file = liquidityPublicationPath): Promise<LiquidityPublication | null> {
  return readFile(file, "utf8").then(text => validateLiquidityPublication(JSON.parse(text))).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
}

export function selectPublishedSeries<T extends Dated>(series: PublishedSeries<T> | undefined, through: string) {
  const value = series?.value.filter(point => point.date <= through);
  if (!value?.length) return { value: null, collectedAt: null, error: "게시된 시장지표가 없습니다." };
  return { value, collectedAt: series!.collectedAt, error: null };
}
