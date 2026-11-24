import { IndexTechnicalBoard } from "@/components/IndexTechnicalBoard";
import { PageHeader } from "@/components/PageHeader";
import { loadIndexTechnical } from "@/lib/sources/index-technical";

export const dynamic = "force-dynamic";

export default async function IndexTechnicalPage() {
  return <>
    <PageHeader title="지수 기술적 분석" description="코스피·코스닥의 종가 흐름과 이동평균, 이격도, 지지·저항을 확인합니다." />
    <IndexTechnicalBoard {...await loadIndexTechnical()} />
  </>;
}
