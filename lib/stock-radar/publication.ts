import fs from "node:fs/promises";
import path from "node:path";
import { isoDatePattern, radarCloseTime, radarCodePattern, radarHistoryLength, radarMarkets } from "./krx";
import { radarPeriods, radarPriceBasis, type RadarPeriod, type RadarSnapshot } from "./model";

export const stockRadarPath = path.join(process.cwd(), "data", "stock-radar", "board.json");

export async function readStockRadar(): Promise<RadarSnapshot | null> {
  try {
    const p = JSON.parse(await fs.readFile(stockRadarPath, "utf8")) as RadarSnapshot;
    if ((p?.version !== 1 && p?.version !== 2) || p.exchange !== "KRX" || p.priceBasis !== radarPriceBasis || p.priceTime !== "15:30 KST" ||
        !isoDatePattern.test(p.asOf) || !isoDatePattern.test(p.universeAsOf) ||
        (p.source === "KRX_OPEN_API" || p.source === "KRX_WEB_VERIFIED" ? p.universeAsOf !== p.asOf : p.source !== "NAVER_KRX_CLOSE" || p.universeAsOf >= p.asOf) ||
        !Number.isFinite(Date.parse(p.fetchedAt)) || Date.parse(p.fetchedAt) < Date.parse(`${p.asOf}T15:30:00+09:00`) ||
        !Array.isArray(p.dates) || p.dates.length !== radarHistoryLength || p.dates.at(-1) !== p.asOf ||
        p.dates.some((date, i) => !isoDatePattern.test(date) || radarCloseTime(date) !== "15:30" || (i > 0 && p.dates[i - 1] >= date)) ||
        !Array.isArray(p.rows) || !radarMarkets.every(market => p.rows.some(row => row.market === market)) ||
        new Set(p.rows.map(row => row.code)).size !== p.rows.length ||
        p.rows.some(row => !radarCodePattern.test(row.code) || !row.name || !radarMarkets.includes(row.market) || !row.metrics ||
          (p.version === 2 && row.marketCap !== null && (!Number.isSafeInteger(row.close) || row.close! <= 0 || !Number.isSafeInteger(row.marketCap) || row.marketCap <= 0))) ||
        !p.series || typeof p.series !== "object" || Array.isArray(p.series)) throw new Error("KRX 신고가·신저가 레이더 데이터 검증 실패");
    return p.version === 1 ? { ...p, rows: p.rows.map(row => ({ ...row, marketCap: null })) } : p;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function getRadarChart(snapshot: RadarSnapshot, code: string, period: RadarPeriod) {
  const item = snapshot.series[code];
  const length = radarPeriods[period] + 1;
  if (!item || !Array.isArray(item.prices) || item.prices.length < length || item.prices.length > radarHistoryLength) return null;
  const dates = snapshot.dates.slice(-length);
  const prices = item.prices.slice(-length);
  if (prices.some(price => !Number.isFinite(price) || price <= 0)) throw new Error("KRX 레이더 차트 데이터 검증 실패");
  return { points: dates.map((date, i) => ({ date, price: prices[i] })), adjusted: item.adjustedFrom != null && dates[0] < item.adjustedFrom };
}
