import { minerviniUniverseIds } from "@/config/minervini";
import { loadDailySectors } from "@/lib/sources/sector-returns-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await Promise.all(minerviniUniverseIds.map(async universe => {
    const board = await loadDailySectors(universe);
    return { universe, ok: !board.stale, asOf: board.snapshot?.asOf ?? null, members: board.snapshot?.rows.length ?? 0, error: board.error };
  }));
  return Response.json({ ok: results.every(r => r.ok), results }, { status: results.every(r => r.ok) ? 200 : 503 });
}
