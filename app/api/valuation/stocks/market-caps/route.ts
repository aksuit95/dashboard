import { unstable_cache } from "next/cache";
import { minerviniSession } from "@/lib/market/minervini-session";
import { fetchValuationMarketCaps } from "@/lib/valuation/market-caps";

export const runtime = "nodejs";
export const maxDuration = 30;
const cachedCaps = unstable_cache(fetchValuationMarketCaps, ["valuation-market-caps-krx-1530-v1"], { revalidate: 300 });

export async function GET() {
  try {
    return Response.json(await cachedCaps(minerviniSession()), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "KRX 15:30 종가 기준 시가총액을 불러오지 못했습니다. 데이터 반영을 눌러 다시 시도해 주세요." }, { status: 502 });
  }
}
