import { loadDailyFearGreed } from "@/lib/sources/fear-greed-daily";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await loadDailyFearGreed());
  } catch {
    return Response.json({ error: "공포·탐욕 지수를 불러오지 못했습니다." }, { status: 500 });
  }
}
