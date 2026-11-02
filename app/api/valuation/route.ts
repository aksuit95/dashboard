import snapshot from "@/data/valuation/kospi200.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  // Static import includes the committed snapshot in the deployment bundle.
  // Production never reads a workstation path or requires QuantiWise/Excel.
  return Response.json({ data: snapshot.data, exportedAt: snapshot.exportedAt }, { headers: { "Cache-Control": "no-store" } });
}
