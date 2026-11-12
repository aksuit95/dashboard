import { isMinerviniUniverse } from "@/config/minervini";
import { resolveSectorDate, sectorDateRange } from "@/lib/market/sector-date";
import { readSectorPublication } from "@/lib/sources/sector-publication";
import { readIndexPublication } from "@/lib/sources/sector-index";
import { matchingCaps, readSectorCaps } from "@/lib/sources/sector-market-caps";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const universe = params.get("universe") ?? "kospi200";
  if (!isMinerviniUniverse(universe)) return Response.json({ error: "지원하지 않는 지수" }, { status: 400 });
  const date = params.get("date");
  const publication = await readSectorPublication();
  if (!publication) return Response.json({ error: "섹터 데이터 수집·배포 대기 중입니다." }, { status: 503 });
  const publicationClock = new Date(`${publication.latestDate}T07:00:00Z`);
  const range = sectorDateRange(publicationClock);
  let session: string;
  try { session = date ? resolveSectorDate(date, publicationClock) : publication.latestDate; }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const snapshot = publication.snapshots[universe][session];
  if (!snapshot) return Response.json({ error: "선택한 거래일의 배포 데이터가 없습니다." }, { status: 404 });
  const indices = await readIndexPublication().catch(() => null);
  const indexDaily = indices?.series[universe]?.[session] ?? null;
  const caps = await readSectorCaps().catch(() => null);
  const marketCaps = matchingCaps(snapshot.rows, caps?.dates[session]);
  return Response.json({ snapshot, indexDaily, marketCaps, stale: false, expectedDate: session, error: null, ...range, requestedDate: date ?? range.latestDate, publishedAt: publication.publishedAt }, { headers: { "Cache-Control": "no-store" } });
}
