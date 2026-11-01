import { MoverBoard } from "@/components/MoverBoard";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { loadMovers } from "@/lib/view/read";

export default function MoversPage() {
  const data = loadMovers(getDb());
  return (
    <div>
      <PageHeader
        title="52주 신고가와 등락"
        description="한국 등락은 챗봇과 같은 네이버 시가총액 상위 20입니다. 52주 신고가는 일봉이 쌓인 종목만 계산합니다. 미국은 시총 10억 달러 미만과 ETF·ETN·REITs·SPAC 을 제외한 유니버스입니다."
      />
      <MoverBoard rows={data.rows} shortWindow={data.shortWindow} excluded={data.excluded} naverAsOf={data.naverAsOf} />
    </div>
  );
}
