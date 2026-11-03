import { loadProxyBoard } from "@/lib/sources/proxy-board";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await loadProxyBoard();
    return Response.json(board, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch {
    return Response.json({ error: "시세를 불러오지 못했습니다." }, { status: 500 });
  }
}
