import { NextResponse } from "next/server";
import { readMarketCaps } from "@/lib/valuation/market-caps";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const caps = await readMarketCaps();
    return NextResponse.json({ prices: caps ? { asOf: caps.asOf, fetchedAt: caps.fetchedAt, closes: caps.closes, securities: caps.securities ?? {} } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ prices: null, error: "KRX 종가 자료를 확인할 수 없습니다." }, { status: 503 });
  }
}
