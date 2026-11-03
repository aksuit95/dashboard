import { loadProxyDailyClose } from "@/lib/sources/proxy-daily-close";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ market: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { market } = await context.params;
  if (market !== "kr" && market !== "us") {
    return Response.json({ error: "Unknown market" }, { status: 400 });
  }
  try {
    // Warm the same shared date-keyed cache read by the chart APIs.
    // Repeated cron calls and page visits reuse a successful daily result.
    const snapshot = await loadProxyDailyClose();
    const adr = snapshot.adr.at(-1);
    return Response.json({
      ok: true, market, koreanCloseDate: snapshot.closeDate,
      adrCloseDate: adr?.adrDate ?? null, fxDate: adr?.fxDate ?? null,
    });
  } catch {
    return Response.json({ ok: false, market, error: "Daily close refresh failed" }, { status: 503 });
  }
}
