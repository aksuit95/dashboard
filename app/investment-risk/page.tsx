import { PageHeader } from "@/components/PageHeader";
import { InvestmentRiskBoard } from "@/components/InvestmentRiskBoard";
export default function Page() {
  return <div><PageHeader title="투자위험" description="시장경보와 공시 재무 점검 신호를 종목별로 확인합니다." /><InvestmentRiskBoard /></div>;
}
