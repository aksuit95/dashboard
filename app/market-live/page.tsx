import type { Metadata } from "next";
import { MarketLiveBoard } from "@/components/MarketLiveBoard";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "한국시장 장중 현황 | mk리서치",
};

export default function MarketLivePage() {
  return (
    <div>
      <PageHeader title="한국시장 장중 현황" description="코스피·코스닥의 장중 흐름과 상승을 주도하는 섹터·종목을 한눈에 봅니다." />
      <MarketLiveBoard />
    </div>
  );
}
