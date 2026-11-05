import { PageHeader } from "@/components/PageHeader";
import { FinancialHealthBoard } from "@/components/FinancialHealthBoard";
export default function FinancialsPage() {
  return <div><PageHeader title="코스피200 현금·재무건전성" description="공시 현금 잔액과 연간 FCF, 부채 부담을 비교하고 가정을 바꿔 미래 현금을 점검합니다." /><FinancialHealthBoard /></div>;
}
