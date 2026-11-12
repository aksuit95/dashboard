"use client";
import { useEffect, useState } from 'react';
import type { AnnualPoint } from '@/lib/valuation/annual-estimates';

type Kind = 'per' | 'pbr';
function ratio(point: AnnualPoint, kind: Kind): number | null {
  const denominator = kind === 'per' ? point.eps : point.bps;
  if (point.close == null || !Number.isFinite(point.close) || denominator == null || !Number.isFinite(denominator) || denominator === 0) return null;
  const result = point.close / denominator;
  return Number.isFinite(result) ? result : null;
}

export function AnnualEstimateChart({code}: {code:string}) {
  const [points,setPoints] = useState<AnnualPoint[]>([]);
  const [kind,setKind] = useState<Kind>('per');
  const [failed,setFailed] = useState(false);
  const [loading,setLoading] = useState(true);
  const [expanded,setExpanded] = useState(false);
  useEffect(() => {
    const c = new AbortController(); setPoints([]); setFailed(false); setLoading(true); setExpanded(false);
    fetch(`/api/valuation/stocks/annual-estimates?code=${encodeURIComponent(code)}`,{signal:c.signal}).then(async r=>{if(!r.ok) throw Error(); return r.json();}).then(x=>{if(!c.signal.aborted) {setPoints(x.points); setLoading(false);}}).catch(()=>{if(!c.signal.aborted) {setFailed(true); setLoading(false);}});
    return ()=>c.abort();
  },[code]);
  const latest = points.at(-1);
  const values = points.map(p => ({...p, ratio:ratio(p,kind)}));
  const available = values.filter(p=>p.ratio !== null);
  const periodCounts = new Map<string, number>();
  for (const p of available) if (p.fiscalPeriod) periodCounts.set(p.fiscalPeriod, (periodCounts.get(p.fiscalPeriod) ?? 0) + 1);
  const canChart = [...periodCounts.values()].some(count => count >= 2);
  const min = Math.min(...available.map(p=>p.ratio!)), max = Math.max(...available.map(p=>p.ratio!)), span=max-min || Math.abs(max)*.1 || 1;
  const first=points.length ? Date.parse(points[0].date) : 0, last=points.length ? Date.parse(points.at(-1)!.date) : 0;
  const x=(date:string)=>last===first?300:45+(Date.parse(date)-first)*510/(last-first);
  const y=(n:number)=>175-(n-min)/span*130;
  return <section className="rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-6">
    <h2 className="font-semibold">예상 결산연도 PER·PBR</h2>
    <p className="mt-1 text-xs leading-relaxed text-zinc-400">네이버 재무정보의 가장 가까운 예상 결산연도 EPS·BPS와 같은 날 KRX 15:30 종가로 계산합니다. 12개월 선행 지표와는 다릅니다.</p>
    <div className="mt-4 grid grid-cols-2 gap-3">{(['per','pbr'] as const).map(k=>{const n=latest ? ratio(latest,k) : null; return <div key={k} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-400">예상 {k.toUpperCase()}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '불러오는 중…' : n === null ? '—' : n.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})} {n !== null && !loading && <span className="text-xs font-normal text-zinc-500">배</span>}</p></div>})}</div>
    {failed ? <p role="status" className="mt-3 text-xs text-amber-200">예상치 이력을 불러오지 못했습니다.</p> : <p className="mt-3 text-xs text-zinc-500">{latest ? `예상 결산 ${latest.fiscalPeriod ?? '결측'} · KRX 15:30 종가 기준일 ${latest.date} · 수집 ${new Date(latest.observedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST` : loading ? '데이터를 불러오고 있습니다.' : '표시할 예상치와 KRX 종가가 없습니다.'}</p>}
    {!failed && !loading && <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} disabled={!canChart} className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-zinc-200 disabled:opacity-40">{expanded && canChart ? '추이 차트 닫기' : '추이 차트 보기'}</button>{(['per','pbr'] as const).map(k=><button type="button" key={k} aria-pressed={kind===k} onClick={()=>setKind(k)} className={`rounded-md border px-3 py-1.5 text-xs ${kind===k?'border-sky-400 text-sky-300':'border-white/10 text-zinc-400'}`}>{k.toUpperCase()}</button>)}</div>
      {!canChart && <p className="mt-2 text-xs text-zinc-500">같은 예상 결산연도의 {kind.toUpperCase()}가 2개 이상 쌓이면 차트를 볼 수 있습니다.</p>}
      {expanded && canChart && <><svg viewBox="0 0 600 220" role="img" aria-label={`예상 결산연도 ${kind.toUpperCase()} 추이`} className="mt-4 w-full max-w-4xl"><line x1="45" y1="175" x2="555" y2="175" stroke="#52525b" />{values.map((p,i)=>{const prev=values[i-1];return <g key={p.date}>{prev && prev.ratio!=null && p.ratio!=null && prev.fiscalPeriod===p.fiscalPeriod && <line x1={x(prev.date)} y1={y(prev.ratio)} x2={x(p.date)} y2={y(p.ratio)} stroke="#38bdf8" strokeWidth="2" />}{p.ratio!=null && <circle cx={x(p.date)} cy={y(p.ratio)} r="4" fill="#38bdf8"><title>{`${p.date} · ${p.fiscalPeriod} 예상 · ${p.ratio.toFixed(2)}배 · 수집 ${p.observedAt}`}</title></circle>}</g>})}<text x="45" y="22" fontSize="11" fill="#a1a1aa">{max.toFixed(2)}배</text><text x="45" y="165" fontSize="11" fill="#a1a1aa">{min.toFixed(2)}배</text></svg><p className="mt-2 text-xs text-zinc-500">결측 또는 예상 결산연도가 바뀌면 선을 끊습니다.</p></>}
    </div>}
  </section>;
}
