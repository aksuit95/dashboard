import { isMarketLiveArchiveDate } from "@/lib/sources/market-live-archive";
import { readSharedMarketLiveArchive } from "@/lib/sources/market-live-publication";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const date = new URL(request.url).searchParams.get("date");
  if (date != null && !isMarketLiveArchiveDate(date)) return Response.json({ error: "올바른 거래일을 선택해 주세요." }, { status: 400, headers });
  try {
    return Response.json(readSharedMarketLiveArchive(date ?? undefined), { headers });
  } catch {
    return Response.json({ error: "장중 섹터 기록을 읽지 못했습니다." }, { status: 503, headers });
  }
}
