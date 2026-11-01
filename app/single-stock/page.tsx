import { PageHeader } from "@/components/PageHeader";
import { SingleStockBoard } from "@/components/SingleStockBoard";

export default function SingleStockPage() {
  return (
    <div>
      <PageHeader
        title="단일종목 레버리지·인버스"
        description="삼성전자와 SK하이닉스 단일종목 ETF의 현재가, 전일 대비, iNAV 괴리율. 20초마다 다시 조회합니다."
      />
      <SingleStockBoard />
    </div>
  );
}
