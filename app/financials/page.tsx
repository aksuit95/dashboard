import { PageHeader } from "@/components/PageHeader";
import { FinancialHealthBoard } from "@/components/FinancialHealthBoard";
export default function FinancialsPage() {
  return <div><PageHeader title="코스피200 현금·재무건전성" description="공시된 현금 잔액과 현금흐름, 차입금과 재무제표 원문 계정을 비교합니다." /><FinancialHealthBoard /></div>;
}
