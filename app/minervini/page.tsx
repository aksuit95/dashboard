import { MinerviniBoard } from "@/components/MinerviniBoard";
import { PageHeader } from "@/components/PageHeader";
import { minerviniUniverseIds, minerviniUniverses } from "@/config/minervini";

export default function MinerviniPage() {
  return <div>
    <PageHeader title="마크 미너비니 기술적분석" description="코스피200 · 코스닥150에서 추세와 상대강도로 주도주를 찾고, 변동성 수축과 거래량으로 셋업을 확인합니다. RS는 각 지수 구성종목 안에서 따로 계산합니다." />
    <nav aria-label="분석 시장 바로가기" className="mb-6 flex gap-2 text-sm">
      {minerviniUniverseIds.map(universe => <a key={universe} href={`#${universe}`} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-zinc-300 hover:bg-white/10">{minerviniUniverses[universe].label} ↓</a>)}
    </nav>
    <div className="space-y-10">
      {minerviniUniverseIds.map(universe => <div key={universe} id={universe} className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">{minerviniUniverses[universe].label} <span className="ml-2 text-sm font-normal text-zinc-500">{minerviniUniverses[universe].name}</span></h2>
        <MinerviniBoard universe={universe} />
      </div>)}
    </div>
  </div>;
}
