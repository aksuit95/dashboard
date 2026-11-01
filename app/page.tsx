import { PageHeader } from "@/components/PageHeader";
import { ProxyBoard } from "@/components/ProxyBoard";

export default function HomePage() {
  return (
    <div>
      <PageHeader
        title="한국 주식 · 글로벌 프록시"
        description="삼성전자와 SK하이닉스를 네이버증권, 바이낸스, 하이퍼리퀴드에서 같이 봅니다. 거래소는 카드에서 바꾸고, 차트로 캔들을 엽니다."
      />
      <ProxyBoard />
    </div>
  );
}
