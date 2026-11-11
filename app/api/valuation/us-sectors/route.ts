import fs from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const data = JSON.parse(await fs.readFile(path.join(process.cwd(), "data/us-sectors/board.json"), "utf8"));
    if (data.schemaVersion !== 1 || data.priceBasis !== "US_REGULAR_CLOSE" || !data.snapshots?.[data.latestDate]) throw new Error("배포 데이터 형식 오류");
    const dates = Object.keys(data.snapshots).sort();
    const requested = new URL(request.url).searchParams.get("date");
    if (requested && (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || requested < dates[0] || requested > data.latestDate)) return Response.json({ error: "조회 가능한 날짜 범위를 벗어났습니다." }, { status: 400 });
    const asOf = requested ? dates.filter(d => d <= requested).at(-1) : data.latestDate;
    if (!asOf) return Response.json({ error: "해당 날짜의 데이터가 없습니다." }, { status: 404 });
    return Response.json({ asOf, requestedDate: requested, latestDate: data.latestDate, dates, fetchedAt: data.fetchedAt, rows: data.snapshots[asOf] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "미국 섹터 데이터 수집·배포 대기 중입니다." }, { status: 503 }); }
}
