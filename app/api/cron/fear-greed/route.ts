import { loadDailyFearGreed } from "@/lib/sources/fear-greed-daily";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const board = await loadDailyFearGreed();
    return Response.json({
      ok: !board.stale, asOf: board.snapshot?.asOf ?? null,
      fetchedAt: board.fetchedAt, error: board.error,
    }, { status: board.stale ? 503 : 200 });
  } catch {
    return Response.json({ ok: false, error: "CNN daily refresh failed" }, { status: 503 });
  }
}
