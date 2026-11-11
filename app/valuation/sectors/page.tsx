import { PageHeader } from "@/components/PageHeader";
import { SectorMarketBoard } from "@/components/SectorMarketBoard";
export default function SectorReturnsPage() {
  return <div><PageHeader title="섹터별 등락률" description="한국과 미국 시장의 섹터 흐름을 비교하고 섹터 안의 주도 종목을 확인합니다." /><SectorMarketBoard /></div>;
}
