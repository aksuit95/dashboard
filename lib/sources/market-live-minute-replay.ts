import { setTimeout as delay } from "node:timers/promises";
import { minerviniUniverseIds } from "@/config/minervini";
import {
  MARKET_LIVE_SECTOR_REFRESH_SECONDS, summarizeMarketLiveArchiveSectors,
  type MarketLiveArchiveFrame, type MarketLiveSectorResponse,
} from "@/lib/market/market-live-archive";
import { calculateMarketLiveRadar } from "@/lib/market/market-live-rotation";
import type { MarketLiveMember, MarketLiveRotationStock } from "@/lib/market/market-live";
import { loadMarketLiveMembers, type resolveMarketLiveSession } from "./market-live";
import {
  fetchNaverStockMinuteChart, isRetryableNaverStockMinuteError, naverStockPreviousKrxClose, parseNaverStockMinutes,
} from "./naver-market-live";
import { readSectorPublication } from "./sector-publication";

type Session = ReturnType<typeof resolveMarketLiveSession> & { baselineDate: string };
type Track = { member: MarketLiveMember; close: number; prices: Map<number, number> };
type Replay = Pick<MarketLiveSectorResponse, "day" | "radar" | "coverage" | "warning">;
const minute = 60_000;
const concurrency = 8;
const retryConcurrency = 4;
const requestSpacingMs = 12;
const refreshMs = MARKET_LIVE_SECTOR_REFRESH_SECONDS * 1000;
let cache: { key: string; until: number; value: Promise<Replay> } | undefined;

function buildMarketLiveMinuteReplay(
  session: Session,
  members: MarketLiveMember[],
  tracks: Track[],
  through: number,
  collectedAt: string,
): Replay {
  const totals = new Map<string, number>();
  for (const member of members) totals.set(member.sector, (totals.get(member.sector) ?? 0) + 1);
  const frames = new Map<number, MarketLiveArchiveFrame>();
  for (let at = session.openAt; at <= Math.min(through, session.closeAt); at += minute) {
    const minuteAt = new Date(at).toISOString();
    const previousAt = at > session.openAt && at !== session.auctionAt && at !== session.closeAt
      ? at - minute : null;
    const previousStamp = previousAt !== null ? new Date(previousAt).toISOString() : null;
    const stocks: MarketLiveRotationStock[] = [];
    let hasPrint = false;
    for (const { member: { code, market, sector }, close, prices } of tracks) {
      const exact = prices.get(at);
      if (exact !== undefined) {
        hasPrint = true;
        stocks.push({ code, market, sector, close, price: exact, asOf: minuteAt });
      } else if (previousAt !== null && previousStamp !== null) {
        const prior = prices.get(previousAt);
        if (prior !== undefined) stocks.push({ code, market, sector, close, price: prior, asOf: previousStamp });
      }
    }
    if (hasPrint) frames.set(at, { minuteAt, collectedAt, stocks, sectors: summarizeMarketLiveArchiveSectors(totals, stocks, 0.5) });
  }
  const latest = [...frames.values()].findLast(frame => frame.sectors.some(sector => sector.changePct !== null));
  if (!latest) return { day: null, radar: null };
  const { date, baselineDate, state } = session;
  const radar = calculateMarketLiveRadar(date, baselineDate, latest, state !== "closed",
    (from, through) => frames.get(through) ?? (through - minute >= from ? frames.get(through - minute) : undefined) ?? null);
  return { day: { date, baselineDate, frames: [...frames.values()].map(({ stocks: _stocks, ...frame }) => frame) }, radar };
}

async function collectReplay(session: Session, now: number): Promise<Replay> {
  const publication = readSectorPublication().catch(() => null);
  const [{ members, warnings }, saved] = await Promise.all([loadMarketLiveMembers(session.date, publication), publication]);
  if (!members.length) throw new Error("지수 구성종목 확인 실패");
  const officialCloses = new Map<string, number>();
  for (const universe of minerviniUniverseIds) {
    for (const row of saved?.snapshots[universe][session.baselineDate]?.rows ?? []) {
      if (row.price !== null) officialCloses.set(row.code, row.price);
    }
  }
  const signal = AbortSignal.timeout(25_000);
  const window = { ...session, now };
  const tracks: Track[] = [];
  let missingCloses = 0;
  let nextStart = performance.now();

  async function fetchTracks(batch: MarketLiveMember[], limit: number) {
    const retry: MarketLiveMember[] = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, batch.length) }, async () => {
      while (!signal.aborted && next < batch.length) {
        const member = batch[next++];
        const start = performance.now();
        // Spread requests even when connections respond fast enough to sustain a much larger burst.
        const wait = Math.max(0, nextStart - start);
        nextStart = start + wait + requestSpacingMs;
        if (wait > 0) await delay(wait, undefined, { signal }).catch(() => undefined);
        if (signal.aborted) return;
        try {
          const chart = await fetchNaverStockMinuteChart(member.code, window, signal);
          const prices = parseNaverStockMinutes(chart, window);
          if (!prices.size) continue;
          const close = officialCloses.get(member.code) ?? naverStockPreviousKrxClose(chart, session.baselineDate);
          if (close === null) missingCloses++;
          else tracks.push({ member, close, prices });
        } catch (error) {
          if (!signal.aborted && isRetryableNaverStockMinuteError(error)) retry.push(member);
        }
      }
    }));
    return retry;
  }

  const retry = await fetchTracks(members, concurrency);
  // Retry transient misses once, after the first wave has drained.
  await fetchTracks(retry, retryConcurrency);
  if (tracks.length < members.length / 2) throw new Error("KRX 분봉 및 비교 종가 확보 종목 부족");
  // Restore membership order so concurrent response timing cannot affect the aggregates.
  tracks.sort((a, b) => a.member.code.localeCompare(b.member.code));
  const result = buildMarketLiveMinuteReplay(session, members, tracks, now, new Date().toISOString());
  if (!result.day) throw new Error("비교 가능한 KRX 분봉 없음");
  const replayWarnings = [...warnings];
  const missingCharts = members.length - tracks.length - missingCloses;
  if (missingCharts) replayWarnings.push(`KRX 장중 분봉 미확인 ${missingCharts}/${members.length}종목`);
  if (missingCloses) replayWarnings.push(`KRX 15:30 비교 종가 미확인 ${missingCloses}/${members.length}종목`);
  return {
    ...result,
    coverage: { compared: tracks.length, total: members.length },
    warning: replayWarnings.join(" · ") || undefined,
  };
}

export function loadMarketLiveMinuteReplay(session: Session, now: number) {
  const key = `${session.date}:${session.baselineDate}:${session.state === "closed" ? "closed" : "live"}`;
  if (!cache || cache.key !== key || cache.until <= now) {
    const entry = {
      key,
      until: now + refreshMs,
      value: collectReplay(session, now).then(result => {
        if (session.state === "closed" && result.day?.frames.at(-1)?.minuteAt === new Date(session.closeAt).toISOString()) {
          entry.until = now + 60 * minute;
        }
        return result;
      }).catch((): Replay => ({
        day: null, radar: null, warning: "당일 KRX 분봉을 충분히 확인하지 못했습니다.",
      })),
    };
    cache = entry;
  }
  return cache;
}
