import { buildBriefing } from "@/lib/market/briefing-report";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const type = p.get("type") === "weekly" ? "weekly" : "daily";
  try {
    return Response.json(await buildBriefing(type, p.get("date") ?? ""), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
