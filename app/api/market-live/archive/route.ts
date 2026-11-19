import { localDate } from "@/lib/market/market-hours";
import { MARKET_LIVE_SECTOR_REFRESH_SECONDS, type MarketLiveSectorResponse } from "@/lib/market/market-live-archive";
import { marketLiveTradingWindow, resolveMarketLiveSession } from "@/lib/market/market-live-session";
import { isMarketLiveArchiveDate, readMarketLiveRotationFrame } from "@/lib/sources/market-live-archive";
import { loadMarketLiveMinuteReplay } from "@/lib/sources/market-live-minute-replay";
import { buildMarketLiveRadar, readMarketLivePublication, readSharedMarketLiveArchive } from "@/lib/sources/market-live-publication";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "icn1";

const noStore = { "Cache-Control": "no-store" };

function cached(data: MarketLiveSectorResponse, maxAge: number) {
  const headers = process.env.VERCEL === "1"
    ? { "Cache-Control": "public, max-age=0, must-revalidate", "Vercel-CDN-Cache-Control": `public, s-maxage=${Math.max(1, maxAge)}` }
    : noStore;
  return Response.json(data, { headers });
}

function archivedRadar(day: NonNullable<MarketLiveSectorResponse["day"]>, now: number, includeLocal: boolean, live: boolean) {
  const published = !live ? readMarketLivePublication(day.date)?.radar : null;
  if (published || !includeLocal) return published ?? null;
  const window = marketLiveTradingWindow(day.date);
  if (!window) return null;
  const frame = readMarketLiveRotationFrame(day.date, day.baselineDate, window.openAt, now);
  return frame ? buildMarketLiveRadar(day.date, day.baselineDate, frame, live) : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  // The on-demand build has one URL. Explicit date queries only read recorded history.
  if (url.search !== (date === null ? "" : `?date=${date}`) || (date !== null && !isMarketLiveArchiveDate(date))) {
    return Response.json({ error: "올바른 거래일을 선택해 주세요." }, { status: 400, headers: noStore });
  }
  try {
    const includeLocal = process.env.VERCEL !== "1";
    if (date) {
      const history = readSharedMarketLiveArchive(date, includeLocal);
      return cached({ ...history, radar: null }, history.day ? 3600 : 60);
    }

    const now = Date.now();
    const today = localDate(now);
    const session = resolveMarketLiveSession(now);
    const live = session.state === "open" || session.state === "auction";
    const saved = readSharedMarketLiveArchive(session.date, includeLocal);
    const { day, dates } = saved;
    const { baselineDate } = session;
    const nextBoundary = live ? session.closeAt : marketLiveTradingWindow(today)?.openAt ?? 0;
    const untilBoundary = nextBoundary > now ? Math.ceil((nextBoundary - now) / 1000) : Infinity;
    const ttl = Math.min(MARKET_LIVE_SECTOR_REFRESH_SECONDS, untilBoundary);

    if (day && baselineDate && day.baselineDate === baselineDate) {
      return cached({ ...saved, radar: archivedRadar(day, now, includeLocal, live) }, ttl);
    }

    let warning: string | undefined;
    if (session.date === today && session.state !== "unconfirmed" && now >= session.openAt + 60_000) {
      if (baselineDate) {
        const pending = loadMarketLiveMinuteReplay({ ...session, baselineDate }, now);
        const rebuilt = await pending.value;
        if (rebuilt.day) {
          const maxAge = Math.floor((pending.until - Date.now()) / 1000);
          const maxThroughClose = live ? Math.ceil((session.closeAt - Date.now()) / 1000) : Infinity;
          return cached({ ...rebuilt, dates: [...new Set([today, ...dates])].sort().reverse() }, Math.min(maxAge, maxThroughClose));
        }
        warning = rebuilt.warning;
      } else {
        warning = "직전 거래일의 KRX 15:30 비교 종가를 확인할 수 없습니다.";
      }
    }

    const earlierDates = dates.filter(date => date < session.date);
    const fallback = earlierDates.length ? readSharedMarketLiveArchive(earlierDates[0], includeLocal).day : null;
    return cached({
      dates: earlierDates, day: fallback, warning,
      radar: fallback ? archivedRadar(fallback, now, includeLocal, false) : null,
    }, live && now < session.openAt + 60_000 ? 30 : ttl);
  } catch {
    return Response.json({ error: "장중 섹터 기록을 읽지 못했습니다." }, { status: 503, headers: noStore });
  }
}
