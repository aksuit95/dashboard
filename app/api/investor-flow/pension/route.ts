import { readPension } from "@/lib/pension/source";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try { const result = await readPension(); return result ? Response.json(result, { headers: { "Cache-Control": "public, s-maxage=60" } }) : Response.json({ error: "국민연금 공시 수집 대기 중입니다." }, { status: 503 }); }
  catch { return Response.json({ error: "저장된 국민연금 공시를 읽지 못했습니다." }, { status: 503 }); }
}
