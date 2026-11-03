import snapshot from "@/data/valuation/stocks.json";
import { parseMinerviniBars } from "@/lib/sources/minervini";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!snapshot.data.stocks.some(stock => stock.code === code)) return Response.json({ error: "밸류에이션 목록에 없는 종목입니다." }, { status: 400 });
  try {
    const response = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=1500&requestType=0`, {
      next: { revalidate: 300 }, headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("일봉 수집 실패");
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const bars = parseMinerviniBars(await response.text(), today);
    return Response.json({ code, bars }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return Response.json({ error: "네이버 일봉을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
