import { PageHeader } from "@/components/PageHeader";
import { RangeChart } from "@/components/RangeChart";
import { readAdr } from "@/lib/sources/adr-naver";
import { minerviniSession } from "@/lib/market/minervini-session";

export const dynamic = "force-dynamic";
export default async function AdrPage() {
  const data = await readAdr().catch(() => null);
  let expected: string | null = null;
  try { expected = minerviniSession(); } catch { /* calendar requires review */ }
  return <div>
    <PageHeader title="등락비율 ADR" description="최근 20거래일 상승 종목 수의 합 ÷ 하락 종목 수의 합 × 100. 네이버에서 제공하는 KRX 정규장 종가로 계산합니다." />
    {!data ? <p className="rounded-xl border border-white/10 p-5 text-zinc-400">ADR 데이터 수집 대기 중입니다. 수집이 완료되면 차트가 표시됩니다.</p> : <>
      {expected !== data.asOf && <p role="status" className="mb-4 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300">최신 완료 거래일의 수집을 확인하지 못했습니다. 마지막 저장 결과를 표시합니다{expected ? ` · 기대 기준일 ${expected}` : " · 거래일 확인 필요"}.</p>}
      <p className="mb-4 text-xs text-zinc-400">기준일 {data.asOf} · KRX 정규장 15:30 종가 · 수집 {new Date(data.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</p>
      <div className="grid gap-4">{(["KOSPI", "KOSDAQ"] as const).map(market => {
        const entry = data.markets[market]; const last = entry.days.at(-1);
        const points = entry.days.filter((d): d is typeof d & { value: number } => d.value != null).map(d => ({date: d.date, value: d.value}));
        return <section key={market} className="rounded-xl border border-white/10 bg-[#151a22] p-5">
          <h2 className="text-lg font-semibold">{market}</h2>
          <p className={`mt-2 text-3xl font-semibold ${last?.value != null && last.value >= 120 ? "text-rose-400" : last?.value != null && last.value <= 80 ? "text-sky-400" : "text-zinc-100"}`}>{last?.value == null ? "—" : `${last.value.toFixed(2)}%`}</p>
          <p className="mt-1 text-sm text-zinc-400">상승 {last?.advancers ?? "—"} · 하락 {last?.decliners ?? "—"} · 보합 {last?.unchanged ?? "—"} · 현재 거래 가능 종목 {entry.universeSize.toLocaleString()}개</p>
          <div className="mt-4"><RangeChart points={points} color="#a1a1aa" thresholds={[80, 120]} ranges={["6M", "1Y"]} /></div>
        </section>;
      })}</div>
      <p className="mt-4 text-xs leading-6 text-zinc-500">현재 상장된 거래 가능 종목의 과거 정규장 종가로 계산합니다. 과거 상장폐지·편입 변동을 재현하지 않으므로 다른 ADR 제공처와 수치가 다를 수 있습니다. 휴장일·장중에는 직전 완료 거래일 기준입니다.</p>
    </>}
  </div>;
}
