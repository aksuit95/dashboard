"use client";
import { useEffect, useState } from 'react';
import type { AnnualPoint } from '@/lib/valuation/annual-estimates';

export function AnnualEstimateChart({code}: {code:string}) {
  const [points,setPoints] = useState<AnnualPoint[]>([]);
  const [kind,setKind] = useState<'per'|'pbr'>('per');
  const [failed,setFailed] = useState(false);
  useEffect(() => { const c = new AbortController(); setPoints([]); setFailed(false); fetch(`/api/valuation/stocks/annual-estimates?code=${encodeURIComponent(code)}`,{signal:c.signal}).then(async r=>{if(!r.ok) throw Error(); return r.json();}).then(x=>{if(!c.signal.aborted) setPoints(x.points)}).catch(()=>{if(!c.signal.aborted) setFailed(true)}); return ()=>c.abort(); },[code]);
  const values = points.map(p => {const d=kind==='per'?p.eps:p.bps; return {...p, ratio:p.close != null && d != null && d !== 0 ? p.close/d : null};});
  const available = values.filter(p=>p.ratio !== null && Number.isFinite(p.ratio));
  const min = Math.min(...available.map(p=>p.ratio!)), max = Math.max(...available.map(p=>p.ratio!)), span=max-min || Math.abs(max)*.1 || 1;
  const first=points.length ? Date.parse(points[0].date) : 0, last=points.length ? Date.parse(points.at(-1)!.date) : 0;
  const x=(date:string)=>last===first?300:45+(Date.parse(date)-first)*510/(last-first);
  const y=(n:number)=>175-(n-min)/span*130;
  return <section className="rounded-xl border border-white/10 bg-[#151a22] p-4">
    <h2 className="font-semibold">예상 결산연도 PER·PBR 추이</h2>
    <p className="mt-1 text-xs leading-relaxed text-zinc-400">네이버 재무정보의 가장 가까운 예상 결산연도 EPS·BPS를 장 마감 후 수집합니다. 같은 날 KRX 15:30 종가로 계산하며, 12개월 선행 지표와는 다릅니다.</p>
    <div className="mt-4 flex gap-2">{(['per','pbr'] as const).map(k=><button type="button" key={k} aria-pressed={kind===k} onClick={()=>setKind(k)} className={`rounded-md border px-3 py-1.5 text-xs ${kind===k?'border-sky-400 text-sky-300':'border-white/10 text-zinc-400'}`}>{k.toUpperCase()}</button>)}</div>
    {failed ? <p role="status" className="py-12 text-center text-sm text-amber-200">이력을 불러오지 못했습니다.</p> : available.length === 0 ? <p className="py-12 text-center text-sm text-zinc-500">표시할 예상치와 KRX 종가가 없습니다. 새 수집일 또는 예상치가 없으면 결측입니다.</p> : <><svg viewBox="0 0 600 220" role="img" aria-label={`예상 결산연도 ${kind.toUpperCase()} 추이`} className="mt-4 w-full max-w-4xl"><line x1="45" y1="175" x2="555" y2="175" stroke="#52525b" />{values.map((p,i)=>{const prev=values[i-1];return <g key={p.date}>{prev && prev.ratio!=null && p.ratio!=null && prev.fiscalPeriod===p.fiscalPeriod && <line x1={x(prev.date)} y1={y(prev.ratio)} x2={x(p.date)} y2={y(p.ratio)} stroke="#38bdf8" strokeWidth="2" />}{p.ratio!=null && <circle cx={x(p.date)} cy={y(p.ratio)} r="4" fill="#38bdf8"><title>{`${p.date} · ${p.fiscalPeriod} 예상 · ${p.ratio.toFixed(2)}배 · 수집 ${p.observedAt}`}</title></circle>}</g>})}<text x="45" y="22" fontSize="11" fill="#a1a1aa">{max.toFixed(2)}배</text><text x="45" y="165" fontSize="11" fill="#a1a1aa">{min.toFixed(2)}배</text></svg><p className="mt-2 text-xs text-zinc-500">최근 {values.at(-1)?.date} · 예상 결산 {values.at(-1)?.fiscalPeriod ?? '결측'} · {kind.toUpperCase()} {values.at(-1)?.ratio == null ? '—' : `${values.at(-1)!.ratio!.toFixed(2)}배`} · 수집 {values.at(-1)?.observedAt ? new Date(values.at(-1)!.observedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST' : '—'} · 결측 또는 예상연도가 바뀌면 선을 끊습니다.</p></>}
  </section>;
}
