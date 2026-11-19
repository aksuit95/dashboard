import { PageHeader } from "@/components/PageHeader";
import { FinancialHealthBoard } from "@/components/FinancialHealthBoard";
export default function FinancialsPage() {
  return <div><PageHeader title="현금·재무건전성" description="코스피200과 코스닥150 기업의 현금 잔액, 현금흐름과 공시 재무제표를 비교합니다." /><FinancialHealthBoard /></div>;
}
