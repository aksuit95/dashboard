import { loadDailyMinervini } from "@/lib/sources/minervini-cache";
import { minerviniUniverseIds } from "@/config/minervini";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await Promise.all(minerviniUniverseIds.map(async universe => {
    const board = await loadDailyMinervini(universe);
    return { universe, ok: !board.stale, asOf: board.snapshot?.asOf ?? null, universeSize: board.snapshot?.universeSize ?? 0, error: board.error };
  }));
  const ok = results.every(result => result.ok);
  return Response.json({ ok, results, error: results.find(result => !result.ok)?.error ?? null }, { status: ok ? 200 : 503 });
}
