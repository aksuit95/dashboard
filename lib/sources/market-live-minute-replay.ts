import { minerviniUniverseIds } from "@/config/minervini";
import {
  MARKET_LIVE_SECTOR_REFRESH_SECONDS, summarizeMarketLiveArchiveSectors,
  type MarketLiveArchiveFrame, type MarketLiveSectorResponse,
} from "@/lib/market/market-live-archive";
import { calculateMarketLiveRadar } from "@/lib/market/market-live-rotation";
import type { MarketLiveMember, MarketLiveRotationStock } from "@/lib/market/market-live";
import { loadMarketLiveMembers, type resolveMarketLiveSession } from "./market-live";
import { fetchNaverStockMinuteChart, naverStockPreviousKrxClose, parseNaverStockMinutes } from "./naver-market-live";
import { readSectorPublication } from "./sector-publication";

type Session = ReturnType<typeof resolveMarketLiveSession> & { baselineDate: string };
type Track = { member: MarketLiveMember; close: number; prices: Map<number, number> };
type Replay = Pick<MarketLiveSectorResponse, "day" | "radar" | "warning">;
const minute = 60_000;
const concurrency = 20;
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
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, members.length) }, async () => {
    while (!signal.aborted && next < members.length) {
      const member = members[next++];
      try {
        const chart = await fetchNaverStockMinuteChart(member.code, window, signal);
        const close = officialCloses.get(member.code) ?? naverStockPreviousKrxClose(chart, session.baselineDate);
        if (close === null) continue;
        const prices = parseNaverStockMinutes(chart, window);
        if (prices.size) tracks.push({ member, close, prices });
      } catch {
        // Keep missing constituent series out of every minute and report reduced coverage.
      }
    }
  }));
  if (tracks.length < members.length / 2) throw new Error("KRX 분봉 및 비교 종가 확보 종목 부족");
  // Restore membership order so concurrent response timing cannot affect the aggregates.
  tracks.sort((a, b) => a.member.code.localeCompare(b.member.code));
  const result = buildMarketLiveMinuteReplay(session, members, tracks, now, new Date().toISOString());
  if (!result.day) throw new Error("비교 가능한 KRX 분봉 없음");
  const coverage = tracks.length < members.length ? `KRX 분봉 및 비교 종가 확인 ${tracks.length}/${members.length}종목` : null;
  return { ...result, warning: [...warnings, coverage].filter(Boolean).join(" · ") || undefined };
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
