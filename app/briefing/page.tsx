import { PageHeader } from "@/components/PageHeader";
import { BriefingBoard } from "@/components/BriefingBoard";

export default function BriefingPage() {
  return <div><div className="briefing-controls"><PageHeader title="장 마감 브리핑" description="일간·주간 시장 흐름을 확인하고 PDF로 저장합니다." /></div><BriefingBoard /></div>;
}
