import { FuturesBoard } from "@/components/FuturesBoard";
import { PageHeader } from "@/components/PageHeader";

export default function FuturesPage() {
  return (
    <div>
      <PageHeader
        title="글로벌 시장"
        description="지수 선물, 미국·아시아·유럽 증시, 반도체·변동성, 환율, 금리·원자재. 1분마다 조회하며 제공처에 따라 시세가 지연될 수 있습니다."
      />
      <FuturesBoard />
    </div>
  );
}
