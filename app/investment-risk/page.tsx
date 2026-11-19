import { PageHeader } from "@/components/PageHeader";
import { InvestmentRiskBoard } from "@/components/InvestmentRiskBoard";
export default function Page() {
  return <div><PageHeader title="투자위험" description="시장경보 현황과 다음 거래일 급등 조건, 공시 재무 위험을 종목별로 확인합니다." /><InvestmentRiskBoard /></div>;
}
