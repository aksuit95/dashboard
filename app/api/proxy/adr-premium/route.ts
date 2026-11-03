import { publishedProxyClose } from "@/lib/sources/proxy-publication";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await publishedProxyClose();
    return Response.json({ closeDate: snapshot.closeDate, fetchedAt: snapshot.fetchedAt, krFetchedAt: snapshot.krFetchedAt, usFetchedAt: snapshot.usFetchedAt, priceBasis: snapshot.priceBasis, usAsOf: snapshot.usAsOf, sharesPerReceipt: 0.1, points: snapshot.adr }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch {
    return Response.json({ error: "종가 기준 괴리율을 불러오지 못했습니다." }, { status: 502 });
  }
}
