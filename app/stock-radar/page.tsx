import { DataFreshness } from "@/components/DataFreshness";
import { PageHeader } from "@/components/PageHeader";
import { StockRadarBoard } from "@/components/StockRadarBoard";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { radarCloseTime } from "@/lib/stock-radar/krx";
import { readStockRadar } from "@/lib/stock-radar/publication";

export const dynamic = "force-dynamic";

export default async function StockRadarPage() {
  const snapshot = await readStockRadar().catch(() => null);
  let notice: string | null;
  let stale = true;
  try {
    const expected = reviewedCloseSession(new Date(), 0);
    if (radarCloseTime(expected) !== "15:30") notice = `${expected} 특별 운영일의 KRX 15:30 종가는 결측입니다.`;
    else if (snapshot?.asOf !== expected) notice = `${expected} 기준 자료가 아직 게시되지 않았습니다.`;
    else {
      stale = false;
      notice = snapshot.source === "NAVER_KRX_CLOSE" ? `네이버 KRX 종가로 먼저 집계했습니다. 보통주 목록 기준일은 ${snapshot.universeAsOf}이며, KRX 일별매매정보가 확인되면 갱신합니다.` : null;
    }
  } catch {
    notice = "최근 KRX 거래일을 확인 중입니다.";
  }
  return <div>
    <PageHeader title="신고가·신저가 레이더 / MDD" description="코스피·코스닥 보통주의 종가 돌파와 고점 대비 낙폭을 확인합니다." />
    <DataFreshness basis={snapshot?.asOf} updatedAt={snapshot?.fetchedAt} basisDetail="KRX 정규장 15:30 KST 종가" updateDetail={snapshot?.source === "NAVER_KRX_CLOSE" ? "네이버 KRX 종가" : "한국거래소 통계정보"} />
    {notice && <p role="status" className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
      {notice}{snapshot && stale && ` ${snapshot.asOf} 저장본을 표시합니다.`}
    </p>}
    {snapshot ? <StockRadarBoard key={snapshot.fetchedAt} rows={snapshot.rows} asOf={snapshot.asOf} fetchedAt={snapshot.fetchedAt} /> :
      <p className="rounded-xl border border-white/10 bg-[#151a22] px-5 py-10 text-center text-sm text-zinc-400">검증된 KRX 레이더 자료가 게시되면 이곳에 표시됩니다.</p>}
  </div>;
}
