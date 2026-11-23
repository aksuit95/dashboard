import fs from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "@/lib/financials/source";
import { fetchKrxDailyCloses } from "@/lib/sources/krx-daily-prices";
import { KrxOpenApiNoDataError, requestKrxOpenApi } from "@/lib/sources/krx-openapi";
import { fetchNaverKrxStockBatch, fetchNaverStockMinuteChart } from "@/lib/sources/naver-market-live";
import { buildRadarSnapshot, marketCapFromNaverListedShares, parseNaverRadarQuote, parseRadarQuotes, parseRadarSecurities, radarCloseTime, radarHistoryLength, radarMarkets, type KrxRadarDay, type RadarSecurity } from "./krx";
import type { RadarMarket, RadarSnapshot } from "./model";

const sources = {
  KOSPI: { quotes: "sto/stk_bydd_trd", master: "sto/stk_isu_base_info", benchmark: "005930" },
  KOSDAQ: { quotes: "sto/ksq_bydd_trd", master: "sto/ksq_isu_base_info", benchmark: "086520" },
} as const;
type Benchmarks = Record<RadarMarket, Map<string, number | null>>;
export const radarCacheDirectory = path.join(process.cwd(), "tmp", "stock-radar", "krx-v1");

export async function addMarketCapsToLegacyRadar(snapshot: RadarSnapshot): Promise<RadarSnapshot> {
  const publishedRows = snapshot.rows.map(row => ({ ...row }));
  const priced = publishedRows.filter(row => row.close !== null);
  for (let start = 0; start < priced.length; start += 400) {
    const batches = Array.from({ length: 4 }, (_, index) => priced.slice(start + index * 100, start + (index + 1) * 100)).filter(batch => batch.length);
    await Promise.all(batches.map(async batch => {
      const quotes = await fetchNaverKrxStockBatch(batch.map(row => row.code));
      for (const row of batch) row.marketCap = marketCapFromNaverListedShares(quotes[row.code], row, snapshot.asOf);
    }));
  }
  if (!publishedRows.some(row => row.marketCap !== null)) throw new Error(`${snapshot.asOf} KRX 상장주식 수 확인 실패`);
  return { ...snapshot, version: 2, rows: publishedRows };
}

async function collectBenchmarks(asOf: string): Promise<Benchmarks> {
  const read = async (market: RadarMarket) => {
    const points = await fetchKrxDailyCloses(sources[market].benchmark, asOf, fetch, radarHistoryLength + 7);
    return new Map(points.map(point => [point.date, point.close]));
  };
  const [KOSPI, KOSDAQ] = await Promise.all([read("KOSPI"), read("KOSDAQ")]);
  return { KOSPI, KOSDAQ };
}

function verifiedMarket(day: KrxRadarDay, market: RadarMarket, benchmarks: Benchmarks) {
  const current = day.markets?.[market];
  const reference = benchmarks[market].get(day.date);
  return current && Object.keys(current).length >= 100 && reference != null && current[sources[market].benchmark]?.close === reference;
}

async function collectOfficialDay(date: string, benchmarks: Benchmarks, useCache: boolean): Promise<KrxRadarDay> {
  const priceTime = radarCloseTime(date);
  const file = path.join(radarCacheDirectory, `${priceTime.replace(":", "")}-${date}.json`);
  if (useCache) {
    try {
      const cached = JSON.parse(await fs.readFile(file, "utf8")) as KrxRadarDay;
      if (cached?.date === date && cached.source === "KRX_OPEN_API" && cached.priceTime === priceTime && radarMarkets.every(market => verifiedMarket(cached, market, benchmarks))) return cached;
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const get = async (market: RadarMarket) => parseRadarQuotes(await requestKrxOpenApi(sources[market].quotes, date.replaceAll("-", "")), market, date);
  const [KOSPI, KOSDAQ] = await Promise.all([get("KOSPI"), get("KOSDAQ")]);
  const day: KrxRadarDay = { date, source: "KRX_OPEN_API", priceTime, markets: { KOSPI, KOSDAQ } };
  for (const market of radarMarkets) {
    if (!verifiedMarket(day, market, benchmarks)) throw new Error(`${date} ${market} KRX ${priceTime} 종가 교차검증 실패`);
  }
  await atomicJson(file, day);
  return day;
}

async function collectUniverse(date: string) {
  const get = async (market: RadarMarket) => {
    const rows = await requestKrxOpenApi(sources[market].master, date.replaceAll("-", ""));
    const securities = parseRadarSecurities(rows, market, date);
    if (securities.length < 100) throw new Error(`${date} ${market} KRX 보통주 목록 누락`);
    return securities;
  };
  const [kospi, kosdaq] = await Promise.all([get("KOSPI"), get("KOSDAQ")]);
  const securities = [...kospi, ...kosdaq];
  if (new Set(securities.map(item => item.code)).size !== securities.length) throw new Error("KRX 보통주 목록 중복");
  return securities;
}

async function collectNaverDay(date: string, securities: RadarSecurity[], benchmarks: Benchmarks): Promise<KrxRadarDay> {
  const day: KrxRadarDay = { date, source: "NAVER_KRX_CLOSE", priceTime: "15:30", markets: { KOSPI: {}, KOSDAQ: {} } };
  const batches: RadarSecurity[][] = [];
  const needsPrint: { security: RadarSecurity; row: unknown }[] = [];
  for (let i = 0; i < securities.length; i += 100) batches.push(securities.slice(i, i + 100));
  for (let i = 0; i < batches.length; i += 4) {
    await Promise.all(batches.slice(i, i + 4).map(async batch => {
      const rows = await fetchNaverKrxStockBatch(batch.map(item => item.code));
      for (const item of batch) {
        const quote = parseNaverRadarQuote(rows[item.code], item, date);
        if (quote) day.markets[item.market][item.code] = quote;
        else if (rows[item.code]) needsPrint.push({ security: item, row: rows[item.code] });
      }
    }));
  }

  const closeAt = Date.parse(`${date}T15:30:00+09:00`);
  const session = { date, closeAt, openAt: Date.parse(`${date}T09:00:00+09:00`), now: Date.now() };
  const stamp = `${date.replaceAll("-", "")}153000`;
  for (let i = 0; i < needsPrint.length; i += 12) {
    await Promise.allSettled(needsPrint.slice(i, i + 12).map(async ({ security, row }) => {
      const chart = await fetchNaverStockMinuteChart(security.code, session, AbortSignal.timeout(6500));
      if (!Array.isArray(chart.priceInfos)) return;
      const closing = chart.priceInfos.find(item => item?.localDateTime === stamp);
      if (!closing || !Number.isFinite(Number(closing.currentPrice)) || !Number.isFinite(Number(closing.accumulatedTradingVolume))) return;
      const quote = parseNaverRadarQuote(row, security, date, { price: Number(closing.currentPrice), volume: Number(closing.accumulatedTradingVolume) });
      if (quote) day.markets[security.market][security.code] = quote;
    }));
  }
  for (const market of radarMarkets) {
    if (!verifiedMarket(day, market, benchmarks)) throw new Error(`${date} ${market} 네이버 KRX 15:30 종가 교차검증 실패`);
  }
  return day;
}

export async function collectStockRadar(asOf: string, force = false) {
  if (radarCloseTime(asOf) !== "15:30") throw new Error(`${asOf} 특별 운영일 KRX 15:30 종가 없음`);
  const benchmarks = await collectBenchmarks(asOf);
  const dated = [...benchmarks.KOSPI.keys()];
  const historyStart = dated.filter(date => radarCloseTime(date) === "15:30").at(-radarHistoryLength);
  if (!historyStart) throw new Error("KRX 거래일 이력 부족");
  const dates = dated.filter(date => date >= historyStart);
  const kosdaqDates = [...benchmarks.KOSDAQ.keys()].filter(date => date >= historyStart);
  if (dates.length !== kosdaqDates.length || dates.some((date, index) => kosdaqDates[index] !== date)) throw new Error("코스피·코스닥 거래일 이력 불일치");

  let universeAsOf = asOf;
  let latest: KrxRadarDay, securities: RadarSecurity[];
  try {
    [latest, securities] = await Promise.all([collectOfficialDay(asOf, benchmarks, !force), collectUniverse(asOf)]);
  } catch (error) {
    if (!(error instanceof KrxOpenApiNoDataError)) throw error;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (today !== asOf) throw error;
    universeAsOf = dates.at(-2)!;
    securities = await collectUniverse(universeAsOf);
    latest = await collectNaverDay(asOf, securities, benchmarks);
  }

  const history: KrxRadarDay[] = [];
  const priorDates = dates.slice(0, -1);
  for (let i = 0; i < priorDates.length; i += 4) {
    history.push(...await Promise.all(priorDates.slice(i, i + 4).map(date => collectOfficialDay(date, benchmarks, true))));
    if (i > 0 && i % 40 === 0) console.log(`KRX 레이더 이력 ${history.length}/${priorDates.length} 거래일 확인`);
  }
  const snapshot = buildRadarSnapshot(asOf, [...history, latest], securities, new Date().toISOString(), universeAsOf);
  for (const market of radarMarkets) {
    const rows = snapshot.rows.filter(row => row.market === market);
    if (!rows.some(row => row.metrics["52w"])) throw new Error(`${market} KRX 52주 분석 가능 종목 없음`);
  }
  return snapshot;
}
