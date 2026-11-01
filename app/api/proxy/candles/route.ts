import { proxyNameById, proxyRanges, type ProxyRange, type ProxyVenue } from "@/config/proxy";
import { loadProxyCandles } from "@/lib/sources/proxy-board";

export const dynamic = "force-dynamic";

const venues = new Set<ProxyVenue>(["naver", "binance", "hyperliquid"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const venue = url.searchParams.get("venue") ?? "";
  const range = url.searchParams.get("range") ?? "";
  if (!proxyNameById(id) || !venues.has(venue as ProxyVenue) || !proxyRanges.includes(range as ProxyRange)) {
    return Response.json({ error: "종목이나 구간이 없습니다." }, { status: 400 });
  }
  try {
    const book = await loadProxyCandles(id, venue as ProxyVenue, range as ProxyRange);
    if (!book) return Response.json({ error: "차트를 만들지 못했습니다." }, { status: 404 });
    return Response.json(book);
  } catch {
    return Response.json({ error: "차트를 불러오지 못했습니다." }, { status: 500 });
  }
}
