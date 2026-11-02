import { PageHeader } from "@/components/PageHeader";
import { MarketHoursBoard } from "@/components/MarketHoursBoard";

export default function MarketHoursPage() {
  return <div>
    <PageHeader title="시장 운영시간" description="지금 어느 시장이 열려 있을까요? KRX, NXT, 미국 주식의 하루를 한국 시간으로 한눈에 확인하세요." />
    <MarketHoursBoard />
  </div>;
}
