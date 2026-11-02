import { PageHeader } from "@/components/PageHeader";
import { ValuationBoard } from "@/components/ValuationBoard";

export default function ValuationPage() {
  return <div>
    <PageHeader title="코스피200 밸류에이션" description="QuantiWise 12개월 선행 컨센서스 · 내보내고 배포한 데이터를 표시합니다." />
    <ValuationBoard />
  </div>;
}
