import { NextResponse } from "next/server";
import { applyFinancialMarketCaps, readFinancialPublication } from "@/lib/financials/source";
import { readMarketCaps } from "@/lib/valuation/market-caps";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Reads only published data. A page visit never triggers 2,000 external API requests. */
export async function GET() {
  try {
    const saved = await readFinancialPublication();
    const caps = await readMarketCaps().catch(() => null);
    const publication = saved ? applyFinancialMarketCaps(saved, caps) : null;
    return NextResponse.json({ publication, error: publication ? null : "재무 데이터가 아직 수집되지 않았습니다. 수집 작업 실행 후 저장 자료를 새로고침해 주세요.", readAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "재무 데이터 조회 실패" }, { status: 503 }); }
}
