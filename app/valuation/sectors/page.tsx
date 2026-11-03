import { PageHeader } from "@/components/PageHeader";
import { SectorReturnsBoard } from "@/components/SectorReturnsBoard";

export default function SectorReturnsPage() {
  return <div><PageHeader title="섹터별 등락률" description="코스피200 · 코스닥150 구성종목의 흐름을 섹터별로 비교하고, 섹터 안의 주도 종목을 확인합니다." /><SectorReturnsBoard /></div>;
}
