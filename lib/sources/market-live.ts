import { minerviniUniverseIds, minerviniUniverses } from "@/config/minervini";
import { classifySector } from "@/config/sectors";
import { hasMarketLiveClosingBasis, resolveMarketLiveSession } from "@/lib/market/market-live-session";
import {
  MARKET_LIVE_POLL_MS, MARKET_LIVE_STALE_MS, marketLiveChange, marketLiveSymbols, summarizeMarketLiveStocks,
  type MarketLiveBoardData, type MarketLiveIndex, type MarketLiveMember, type MarketLiveQuote, type MarketLiveSymbol,
} from "@/lib/market/market-live";
import { requestKrxOpenApi } from "@/lib/sources/krx-openapi";
import { fetchIndexMembers } from "@/lib/sources/minervini";
import { fetchNaverLiveIndex, fetchNaverLiveStocks } from "@/lib/sources/naver-market-live";
import { readSectorPublication, type SectorPublication } from "@/lib/sources/sector-publication";

export { marketLiveTradingWindow, resolveMarketLiveSession } from "@/lib/market/market-live-session";

const retryMs = 60_000;
const dayMs = 86_400_000;
const markets = {
  KOSPI: { index: "idx/kospi_dd_trd", stocks: "sto/stk_bydd_trd", indexName: "코스피" },
  KOSDAQ: { index: "idx/kosdaq_dd_trd", stocks: "sto/ksq_bydd_trd", indexName: "코스닥" },
} as const;

type Session = ReturnType<typeof resolveMarketLiveSession>;
type DailyStock = { price: number; turnover: number | null };
type MarketCloses = { index: number | null; stocks: Map<string, DailyStock> };

type CacheEntry<T> = { key: string; until: number; result: Promise<T> };
const dailyCache = new Map<string, CacheEntry<MarketCloses>>();
let memberCache: CacheEntry<{ members: MarketLiveMember[]; warnings: string[] }> | undefined;
let boardCache: CacheEntry<MarketLiveBoardData> | undefined;

function numberField(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

async function publishedIndexClose(symbol: MarketLiveSymbol, date: string): Promise<number | null> {
  const file = path.join(process.cwd(), "public/data/market-indicators-live", symbol.toLowerCase());
  try {
    const [points, metadata] = await Promise.all([
      readFile(`${file}.json`, "utf8").then(JSON.parse) as Promise<{ date: string; value: unknown }[]>,
      readFile(`${file}.meta.json`, "utf8").then(JSON.parse),
    ]);
    if (metadata?.status !== "ok" || metadata.basis !== "KRX 정규장 15:30 KST" ||
        metadata.source !== "KRX 정보데이터시스템" || typeof metadata.asOf !== "string" || metadata.asOf < date) return null;
    const value = points.find(point => point.date === date)?.value;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

async function collectCloses(symbol: MarketLiveSymbol, date: string): Promise<MarketCloses> {
  const { stocks, index, indexName } = markets[symbol];
  const key = date.replaceAll("-", "");
  const [stocksResult, indexResult] = await Promise.allSettled([requestKrxOpenApi(stocks, key), requestKrxOpenApi(index, key)]);
  const rows = new Map<string, DailyStock>();
  if (stocksResult.status === "fulfilled") {
    for (const row of stocksResult.value) {
      const price = numberField(row.TDD_CLSPRC);
      if (typeof row.ISU_CD === "string" && /^[0-9A-Z]{6}$/.test(row.ISU_CD) && row.MKT_NM === symbol && price != null && price > 0) {
        rows.set(row.ISU_CD, { price, turnover: numberField(row.ACC_TRDVAL) });
      }
    }
  }
  const indexRows = indexResult.status === "fulfilled"
    ? indexResult.value.filter(row => String(row.IDX_NM).replace(/\s/g, "") === indexName)
    : [];
  const close = indexRows.length === 1 ? numberField(indexRows[0].CLSPRC_IDX) : null;
  return { stocks: rows, index: close && close > 0 ? close : await publishedIndexClose(symbol, date) };
}

function loadCloses(symbol: MarketLiveSymbol, date: string | null) {
  if (!date) return Promise.resolve<MarketCloses>({ index: null, stocks: new Map() });
  const key = `${symbol}:${date}`;
  const saved = dailyCache.get(key);
  if (saved && saved.until > Date.now()) return saved.result;
  for (const [id, entry] of dailyCache) if (entry.until <= Date.now()) dailyCache.delete(id);
  const entry: CacheEntry<MarketCloses> = {
    key, until: Infinity,
    result: collectCloses(symbol, date).then(result => {
      entry.until = Date.now() + (result.index != null && result.stocks.size ? dayMs : retryMs);
      return result;
    }),
  };
  dailyCache.set(key, entry);
  return entry.result;
}

function loadMembers(date: string, publication: Promise<SectorPublication | null>) {
  if (memberCache?.key === date && memberCache.until > Date.now()) return memberCache.result;
  const entry: NonNullable<typeof memberCache> = {
    key: date, until: Infinity,
    result: Promise.all([
      publication,
      Promise.allSettled(minerviniUniverseIds.map(universe => fetchIndexMembers(universe))),
    ]).then(([saved, results]) => {
      const warnings: string[] = [];
      const members = minerviniUniverseIds.flatMap((universe, i) => {
        const spec = minerviniUniverses[universe];
        const latest = saved && saved.snapshots[universe][saved.latestDate];
        const groups = new Map(latest?.rows.map(row => [row.code, row.industry]) ?? []);
        const result = results[i];
        if (result.status === "rejected") {
          warnings.push(latest ? `${spec.name} 구성종목 · ${latest.asOf} 저장 목록 사용` : `${spec.name} 구성종목을 불러오지 못했습니다.`);
        }
        const stocks = result.status === "fulfilled" ? result.value : latest?.rows ?? [];
        return stocks.map(stock => ({ code: stock.code, name: stock.name, market: spec.market, sector: classifySector(stock.code, groups.get(stock.code) ?? null) }));
      });
      entry.until = Date.now() + (warnings.length ? retryMs : dayMs);
      return { members, warnings };
    }),
  };
  memberCache = entry;
  return entry.result;
}

const emptyIndex = (symbol: MarketLiveSymbol): MarketLiveIndex => ({
  symbol, price: null, asOf: null, changePct: null, turnover: null, breadth: null, points: [],
});

async function collectBoard(session: Session): Promise<MarketLiveBoardData> {
  const { state, note, date, baselineDate, openAt, closeAt } = session;
  const frame = { state, note, date, baselineDate };
  if (state === "unconfirmed") {
    return { ...frame, collectedAt: new Date().toISOString(), indexes: marketLiveSymbols.map(emptyIndex),
      ...summarizeMarketLiveStocks([], [], new Map(), 0), warnings: [] };
  }
  const publication = readSectorPublication().catch(() => null);
  const indexFeed = marketLiveSymbols.map(symbol => fetchNaverLiveIndex(symbol, date, openAt, closeAt, Date.now()));
  const previousCloses = marketLiveSymbols.map(symbol => loadCloses(symbol, baselineDate));
  const standardClose = hasMarketLiveClosingBasis(date, closeAt);
  const finalCloses = state === "closed"
    ? Promise.all(marketLiveSymbols.map(symbol => loadCloses(symbol, standardClose ? date : null)))
    : Promise.resolve([]);
  const membership = loadMembers(date, publication);
  const stockFeed = state === "closed"
    ? Promise.resolve({ quotes: [] as MarketLiveQuote[], failedBatches: 0 })
    : membership.then(({ members }) => fetchNaverLiveStocks(members.map(member => member.code), date, openAt, closeAt, Date.now()));
  const [saved, liveIndexes, previous, final, { members, warnings: memberWarnings }, liveStocks] = await Promise.all([
    publication, Promise.all(indexFeed), Promise.all(previousCloses), finalCloses, membership, stockFeed,
  ]);
  const warnings = [...memberWarnings];
  const closeByCode = new Map<string, number>();
  const savedFinal = new Map<string, number>();
  minerviniUniverseIds.forEach((universe, i) => {
    for (const [code, daily] of previous[i].stocks) closeByCode.set(code, daily.price);
    for (const row of (baselineDate && saved?.snapshots[universe][baselineDate]?.rows) || []) {
      if (row.price != null && !closeByCode.has(row.code)) closeByCode.set(row.code, row.price);
    }
    for (const row of (standardClose && saved?.snapshots[universe][date]?.rows) || []) {
      if (row.price != null) savedFinal.set(row.code, row.price);
    }
  });

  const closedStamp = new Date(closeAt).toISOString();
  const indexes = marketLiveSymbols.map((symbol, i) => {
    const live = liveIndexes[i];
    const isClosed = state === "closed";
    const price = isClosed ? final[i].index : live.price;
    const asOf = isClosed ? price == null ? null : closedStamp : live.asOf;
    const base = previous[i].index ?? (baselineDate && live.previousDate === baselineDate ? live.previousClose : null);
    const changePct = marketLiveChange(price, base ?? undefined);
    return { symbol, price, asOf, changePct, turnover: isClosed ? null : live.turnover, breadth: isClosed ? null : live.breadth, points: live.points };
  });
  const quotes = state === "closed" ? members.flatMap(member => {
    const daily = final[member.market === "KOSPI" ? 0 : 1].stocks.get(member.code);
    const price = daily?.price ?? savedFinal.get(member.code);
    return price == null ? [] : [{ code: member.code, price, turnover: daily?.turnover ?? 0, asOf: closedStamp }];
  }) : liveStocks.quotes;
  const now = Date.now();
  const reference = state === "auction" ? session.auctionAt : now;
  const summary = summarizeMarketLiveStocks(members, quotes, closeByCode, state === "closed" ? closeAt : reference - MARKET_LIVE_STALE_MS);
  if (liveStocks.failedBatches) warnings.push(`장중 종목 시세 ${liveStocks.failedBatches}개 묶음 조회 실패`);
  if (indexes.some(index => index.price == null)) {
    warnings.push(state !== "closed" ? "일부 지수 시세를 불러오지 못했습니다." : standardClose
      ? "일부 지수의 KRX 15:30 종가 반영 대기 중입니다."
      : "특별 정규장 거래일의 KRX 15:30 종가는 제공되지 않습니다.");
  }
  if (state === "open" && indexes.some(index => index.asOf && now - Date.parse(index.asOf) > MARKET_LIVE_STALE_MS)) warnings.push("일부 지수 시세 수신이 90초 이상 지연됐습니다.");
  if (members.length && !summary.breadth.compared && (state !== "closed" || standardClose)) warnings.push(state === "closed" ? "종목의 KRX 정규장 종가 반영 대기 중입니다." : "최근 체결가와 직전 KRX 종가를 함께 확인한 종목이 없습니다.");
  if (!baselineDate) warnings.push("비교에 필요한 직전 거래일 KRX 15:30 종가 기준을 확인할 수 없습니다.");
  const rotationStocks = state === "closed" ? [] : summary.rotationStocks;
  return { ...frame, collectedAt: new Date(now).toISOString(), indexes, ...summary, rotationStocks, warnings };
}

export function loadMarketLiveBoard() {
  const session = resolveMarketLiveSession(Date.now());
  const key = `${session.date}:${session.state}`;
  if (boardCache?.key === key && boardCache.until > Date.now()) return boardCache.result;
  const entry: CacheEntry<MarketLiveBoardData> = {
    key, until: Infinity,
    result: collectBoard(session).finally(() => { entry.until = Date.now() + MARKET_LIVE_POLL_MS - 1000; }),
  };
  boardCache = entry;
  return entry.result;
}
import { readFile } from "node:fs/promises";
import path from "node:path";
