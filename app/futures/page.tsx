import { FuturesBoard } from "@/components/FuturesBoard";
import { PageHeader } from "@/components/PageHeader";

export default function FuturesPage() {
  return (
    <div>
      <PageHeader
        title="글로벌 선물"
        description="코스피200 선물, 나스닥·S&P 선물, 미국 10년 금리, WTI, 원달러. 20초마다 다시 조회합니다."
      />
      <FuturesBoard />
    </div>
  );
}
