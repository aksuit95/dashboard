import { isMinerviniUniverse } from "@/config/minervini";
import { resolveSectorDate, sectorDateRange } from "@/lib/market/sector-date";
import { readSectorPublication } from "@/lib/sources/sector-publication";

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
  return Response.json({ snapshot, stale: false, expectedDate: session, error: null, ...range, requestedDate: date ?? range.latestDate, publishedAt: publication.publishedAt }, { headers: { "Cache-Control": "no-store" } });
}
