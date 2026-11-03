import snapshot from "@/data/valuation/stocks.json";
import { unstable_cache } from "next/cache";
import { fetchKrxDailyBars } from "@/lib/sources/krx-daily-prices";
import { minerviniSession } from "@/lib/market/minervini-session";

export const runtime = "nodejs";
export const maxDuration = 300;
const cachedCandles = unstable_cache(async (code: string, asOf: string) => ({
  code, asOf, priceBasis: "KRX_REGULAR_CLOSE" as const,
  bars: await fetchKrxDailyBars(code, asOf, fetch, 1500), fetchedAt: new Date().toISOString(),
}), ["valuation-stock-candles-krx-1530-v2"], { revalidate: 300 });

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!snapshot.data.stocks.some(stock => stock.code === code)) return Response.json({ error: "밸류에이션 목록에 없는 종목입니다." }, { status: 400 });
  try {
    const asOf = minerviniSession();
    return Response.json(await cachedCandles(code, asOf), { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
  } catch {
    return Response.json({ error: "KRX 15:30 정규장 일봉을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
