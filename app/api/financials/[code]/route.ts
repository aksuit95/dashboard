import { NextResponse } from "next/server";
import { readFinancialPublication } from "@/lib/financials/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[0-9A-Z]{6}$/.test(code)) return NextResponse.json({ error: "종목코드 형식 오류" }, { status: 400 });
  try {
    const publication = await readFinancialPublication();
    const company = publication?.companies.find(c => c.code === code);
    if (!company) return NextResponse.json({ error: "저장된 기업 자료가 없습니다." }, { status: 404 });
    return NextResponse.json({ company }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "상세 자료 조회 실패" }, { status: 503 }); }
}
