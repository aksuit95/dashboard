import { isMinerviniUniverse } from "@/config/minervini";
import { minerviniSession } from "@/lib/market/minervini-session";
import { buildRisingBoard } from "@/lib/market/rising";
import { matchingCaps, readSectorCaps } from "@/lib/sources/sector-market-caps";
import { readSectorPublication } from "@/lib/sources/sector-publication";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const universe = new URL(request.url).searchParams.get("universe") ?? "kospi200";
  if (!isMinerviniUniverse(universe)) return Response.json({ error: "지원하지 않는 지수" }, { status: 400 });
  try {
    const publication = await readSectorPublication();
    if (!publication) throw new Error("섹터 데이터 수집·배포 대기 중입니다.");
    const published = publication.snapshots[universe];
    const earliest = Object.keys(published).sort()[0];
    const dates = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const date = new Date(Date.parse(`${publication.latestDate}T07:00:00Z`) - i * 86400000);
      try { const session = minerviniSession(date); if (session >= earliest) dates.add(session); } catch { break; }
    }
    const sessions = [...dates].sort().reverse();
    const data = buildRisingBoard(sessions.map(date => published[date] ?? null));
    const caps = await readSectorCaps().catch(() => null);
    const marketCaps = matchingCaps(published[publication.latestDate].rows, caps?.dates[publication.latestDate]);
    return Response.json({ ...data, marketCaps, capsFetchedAt: caps?.fetchedAt ?? null, asOf: publication.latestDate, fetchedAt: published[publication.latestDate].fetchedAt, publishedAt: publication.publishedAt, sessions: sessions.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "데이터 조회 실패" }, { status: 503 }); }
}
