import { getDb } from "@/lib/db/client";
import { collectInvestorDaily } from "@/lib/sources/investor-flow-daily";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await collectInvestorDaily(getDb());
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "수급 예약 수집 실패" }, { status: 503 });
  }
}
