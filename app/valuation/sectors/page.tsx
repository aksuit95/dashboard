import { PageHeader } from "@/components/PageHeader";
import { SectorMarketBoard } from "@/components/SectorMarketBoard";
export default function SectorReturnsPage() {
  return <div><PageHeader title="섹터/종목 등락률" description="한국과 미국의 섹터 흐름과 국내 종목별 등락률을 확인합니다." /><SectorMarketBoard /></div>;
}
