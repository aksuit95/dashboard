import kospi from "@/data/valuation/kospi200.json";
import kosdaq from "@/data/valuation/kosdaq150.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const universe = new URL(request.url).searchParams.get("universe") ?? "kospi200";
  if (universe !== "kospi200" && universe !== "kosdaq150") return Response.json({ error: "지수를 확인해 주세요." }, { status: 400 });
  const snapshot = universe === "kosdaq150" ? kosdaq : kospi;
  // Static import includes the committed snapshot in the deployment bundle.
  // Production never reads a workstation path or requires QuantiWise/Excel.
  return Response.json({ data: snapshot.data, exportedAt: snapshot.exportedAt }, { headers: { "Cache-Control": "no-store" } });
}
