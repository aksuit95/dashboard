import { loadProxyDailyClose } from "@/lib/sources/proxy-daily-close";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await loadProxyDailyClose();
    return Response.json({ closeDate: snapshot.closeDate, sharesPerReceipt: 0.1, points: snapshot.adr }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch {
    return Response.json({ error: "종가 기준 괴리율을 불러오지 못했습니다." }, { status: 502 });
  }
}
