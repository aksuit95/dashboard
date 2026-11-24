import { krxCloseTime } from "@/config/market-calendar";
import { calculateRadarMetrics, radarPeriods, radarPriceBasis, radarThresholds, type RadarAboveSma20, type RadarMarket, type RadarPeriod, type RadarPoint, type RadarRow, type RadarSnapshot } from "./model";

type SourceRow = Record<string, unknown>;
export type RadarSecurity = { code: string; name: string; market: RadarMarket; listedOn: string };
export type KrxRadarQuote = { close: number; reference: number | null; shares: number; turnover: number; volume: number };
export type KrxRadarDay = {
  date: string;
  source: RadarSnapshot["source"];
  priceTime: "15:30" | "16:30";
  markets: Record<RadarMarket, Record<string, KrxRadarQuote | null>>;
};
export const radarMarkets = ["KOSPI", "KOSDAQ"] as const;
export const radarHistoryLength = radarPeriods["52w"] + 1;
export const radarCodePattern = /^[A-Z0-9]{6}$/;
export const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function radarCloseTime(date: string) {
  // The 2025 CSAT session can still fall inside the 252-session window.
  return date === "2025-11-13" ? "16:30" : krxCloseTime(date);
}

function numeric(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  const text = String(value).trim().replaceAll(",", "");
  return /^[+-]?\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}

function validatedQuote(close: number, shares: number, cap: number, turnover: number, volume: number, change: number, rate: number): KrxRadarQuote | null {
  if (![close, shares, cap, turnover, volume].every(Number.isSafeInteger) || close <= 0 || shares <= 0 || close * shares !== cap || turnover < 0 || volume < 0) return null;
  // The signed change and the rounded rate must agree on the reference price.
  const base = close - change;
  const reference = Number.isSafeInteger(base) && base > 0 && Math.abs(change / base * 100 - rate) <= 0.00501 ? base : null;
  return { close, shares, turnover, volume, reference };
}

export function parseRadarSecurities(rows: SourceRow[], market: RadarMarket, asOf: string): RadarSecurity[] {
  const securities: RadarSecurity[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const code = row.ISU_SRT_CD, kind = row.KIND_STKCERT_TP_NM, group = row.SECUGRP_NM;
    if (typeof code !== "string" || !radarCodePattern.test(code) || seen.has(code) || row.MKT_TP_NM !== market || typeof kind !== "string" || !kind || typeof group !== "string" || !group) throw new Error(`${market} KRX 종목기본정보 형식 오류`);
    seen.add(code);
    if (kind !== "보통주" || (group !== "주권" && group !== "외국주권")) continue;
    const name = typeof row.ISU_ABBRV === "string" ? row.ISU_ABBRV.trim() : "";
    const listedOn = String(row.LIST_DD ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    if (!name || !isoDatePattern.test(listedOn) || listedOn > asOf) throw new Error(`${market} ${code} KRX 상장정보 오류`);
    securities.push({ code, name, market, listedOn });
  }
  return securities;
}

export function parseRadarQuotes(rows: SourceRow[], market: RadarMarket, date: string) {
  const quotes: Record<string, KrxRadarQuote | null> = {};
  const basDd = date.replaceAll("-", "");
  for (const row of rows) {
    const code = row.ISU_CD;
    if (typeof code !== "string" || !radarCodePattern.test(code) || Object.hasOwn(quotes, code) || row.BAS_DD !== basDd || row.MKT_NM !== market) throw new Error(`${date} ${market} KRX 일별매매정보 형식 오류`);
    quotes[code] = validatedQuote(numeric(row.TDD_CLSPRC), numeric(row.LIST_SHRS), numeric(row.MKTCAP), numeric(row.ACC_TRDVAL), numeric(row.ACC_TRDVOL), numeric(row.CMPPREVDD_PRC), numeric(row.FLUC_RT));
  }
  return quotes;
}

function matchingNaverRow(value: unknown, security: Pick<RadarSecurity, "code" | "market">, date: string) {
  const row = value as SourceRow | null;
  if (!row || row.itemCode !== security.code || row.stockExchangeType !== security.market || row.stockEndType !== "stock" || row.currencyType !== "KRW") return null;
  const stamp = row.localTradedAt;
  if (typeof stamp !== "string" || !stamp.startsWith(`${date}T`) || !stamp.endsWith("+09:00") || !Number.isFinite(Date.parse(stamp))) return null;
  return { row, stamp };
}

export function parseNaverRadarQuote(value: unknown, security: RadarSecurity, date: string, closingPrint?: { price: number; volume: number }): KrxRadarQuote | null {
  const match = matchingNaverRow(value, security, date);
  if (!match) return null;
  const { row, stamp } = match;
  const close = numeric(row.currentPrice), volume = numeric(row.accumulatedTradingVolume);
  // The bulk quote can carry a later observation timestamp. Confirm both its price
  // and KRX session volume against the 15:30 print before accepting that quote.
  const verified = closingPrint ? closingPrint.price === close && closingPrint.volume === volume :
    row.marketStatus === "CLOSE" && Date.parse(stamp) === Date.parse(`${date}T15:30:00+09:00`);
  if (!verified) return null;
  return validatedQuote(close, numeric(row.countOfListedStock), numeric(row.marketValue), numeric(row.accumulatedTradingValue), volume, numeric(row.fluctuations), numeric(row.fluctuationsRatio));
}

export function marketCapFromNaverListedShares(value: unknown, security: Pick<RadarRow, "code" | "market" | "close">, date: string): number | null {
  if (security.close === null) return null;
  const match = matchingNaverRow(value, security, date);
  if (!match) return null;
  const price = numeric(match.row.currentPrice), shares = numeric(match.row.countOfListedStock), cap = numeric(match.row.marketValue);
  if (![price, shares, cap].every(Number.isSafeInteger) || price <= 0 || shares <= 0 || price * shares !== cap) return null;
  // Use the verified closing price in the snapshot. The quote price only checks the reported share count.
  const closingCap = security.close * shares;
  return Number.isSafeInteger(closingCap) && closingCap > 0 ? closingCap : null;
}

function splitFactor(older: KrxRadarQuote, newer: KrxRadarQuote): number | null {
  if (newer.reference === older.close) return 1;
  // Only bridge a share-ratio change when the KRX reference confirms the same factor.
  const ratio = older.shares / newer.shares;
  if (newer.reference !== null && (ratio <= 0.9 || ratio >= 1.1) && Math.abs(older.close * ratio - newer.reference) < 1e-8) return ratio;
  return null;
}

function radarHistory(security: RadarSecurity, days: KrxRadarDay[]) {
  const points: RadarPoint[] = [];
  let newer: KrxRadarQuote | null = null, newerOrdinary = true;
  let factor = 1;
  let adjustedFrom: string | null = null;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.date < security.listedOn) break;
    const quote = day.markets.KOSPI[security.code] ?? day.markets.KOSDAQ[security.code];
    if (!quote) break;
    const ordinary = day.priceTime === "15:30";
    if (newer) {
      const step = splitFactor(quote, newer);
      // A special-session close checks continuity only. It cannot set an adjustment or enter a window.
      if (step === null || ((!ordinary || !newerOrdinary) && step !== 1)) break;
      if (step !== 1 && adjustedFrom === null) adjustedFrom = points.at(-1)!.date;
      factor *= step;
    }
    if (ordinary) points.push({ date: day.date, price: Math.round(quote.close * factor * 1e8) / 1e8 });
    newer = quote;
    newerOrdinary = ordinary;
  }
  return { points: points.reverse(), adjustedFrom };
}

export function buildRadarSnapshot(asOf: string, days: KrxRadarDay[], securities: RadarSecurity[], fetchedAt: string, universeAsOf = asOf): RadarSnapshot {
  const latestDay = days.at(-1);
  if (latestDay?.date !== asOf || latestDay.priceTime !== "15:30") throw new Error(`${asOf} KRX 15:30 종가 없음`);
  const dates = days.filter(day => day.priceTime === "15:30").map(day => day.date);
  if (dates.length !== radarHistoryLength) throw new Error("KRX 15:30 거래일 이력 부족");
  const series: RadarSnapshot["series"] = {};
  const aboveSma20: RadarAboveSma20 = { KOSPI: { above: 0, eligible: 0 }, KOSDAQ: { above: 0, eligible: 0 } };
  const rows: RadarRow[] = securities.map(({ code, name, market, listedOn }) => {
    const latest = latestDay.markets[market][code];
    const { points, adjustedFrom } = latest?.volume ? radarHistory({ code, name, market, listedOn }, days) : { points: [], adjustedFrom: null };
    const window = points.slice(-20);
    if (window.length === 20 && window.at(-1)?.date === asOf) {
      aboveSma20[market].eligible++;
      if (window[19].price > window.reduce((sum, point) => sum + point.price, 0) / 20) aboveSma20[market].above++;
    }
    const metrics = Object.fromEntries(Object.entries(radarPeriods).map(([period, length]) => [period, calculateRadarMetrics(points, length)])) as RadarRow["metrics"];
    if (Object.values(metrics).some(item => item && (item.breakoutPct !== null || item.breakdownPct !== null || item.currentDrawdownPct <= radarThresholds[0]))) {
      series[code] = { prices: points.map(point => point.price), adjustedFrom };
    }
    return { code, name, market, close: latest?.close ?? null, marketCap: latest ? latest.close * latest.shares : null, turnover: latest?.turnover ?? null, metrics };
  });
  return { version: 2, exchange: "KRX", priceBasis: radarPriceBasis, priceTime: "15:30 KST", asOf, fetchedAt, universeAsOf, source: latestDay.source, dates, rows, series, aboveSma20 };
}

export function radarPeriod(value: string | null): RadarPeriod | null {
  return value !== null && Object.hasOwn(radarPeriods, value) ? value as RadarPeriod : null;
}
