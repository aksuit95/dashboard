import snapshot from "@/data/valuation/stocks.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
