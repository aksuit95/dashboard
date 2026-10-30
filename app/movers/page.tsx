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
        description="한국 시총 1,000억 원 미만, 미국 시총 10억 달러 미만, ETF·ETN·REITs·SPAC 은 제외합니다. 전 종목 목록 없이 설정의 유니버스만 계산합니다."
      />
      <MoverBoard rows={data.rows} shortWindow={data.shortWindow} excluded={data.excluded} />
    </div>
  );
}
