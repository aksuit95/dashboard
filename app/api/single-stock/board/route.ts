import { loadSingleStockBoard } from "@/lib/sources/single-stock";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await loadSingleStockBoard());
  } catch {
    return Response.json({ error: "시세를 불러오지 못했습니다." }, { status: 500 });
  }
}
