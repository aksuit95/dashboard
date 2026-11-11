"use client";
import { useMemo, useState } from "react";
import { periodOptions, type Holding, type Snapshot, type Publication, type Period } from "@/lib/etf/holdings";

type Sort = "strength" | "change" | "weight";
const signed = (n: number, digits = 0) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const color = (n: number) => n > 0 ? "text-rose-400" : n < 0 ? "text-sky-400" : "text-zinc-400";
export function EtfHoldingsBoard({ latest, periods, expected, stale, lastAttempt, name, code, period, setPeriod }: { latest: Snapshot | null; periods: Record<Period, { date: string | null; snapshot: Snapshot | null }>; expected: string | null; stale: boolean; lastAttempt: Publication["lastAttempt"]; name: string; code: string; period: Period; setPeriod: (period: Period) => void }) {

  const previous = periods[period].snapshot;
  const [sort, setSort] = useState<Sort>("strength");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    if (!latest) return [];
    const earlier = new Map((previous?.holdings ?? []).map(r => [r.code, r]));
    const later = new Map(latest.holdings.map(r => [r.code, r]));
    const codes = new Set([...later.keys(), ...(previous ? earlier.keys() : [])]);
    const all = [...codes].map(code => {
      const a = earlier.get(code), b = later.get(code), item = (b ?? a) as Holding;
      const oldQty = previous ? a?.quantity ?? 0 : null, newQty = b?.quantity ?? 0;
      const oldWeight = previous ? a?.weight ?? 0 : null, newWeight = b?.weight ?? 0;
      const delta = oldQty == null ? null : newQty - oldQty;
      const change = delta == null || !oldQty ? null : delta / oldQty * 100;
      const market = latest.market[code];
      const ratio = delta != null && market?.cap > 0 && market?.close > 0 ? delta * market.close / market.cap : null;
      return { ...item, oldQty, newQty, oldWeight, newWeight, delta, change, ratio };
    });
    const max = Math.max(0, ...all.map(r => Math.abs(r.ratio ?? 0)));
    return all.map(r => ({ ...r, score: r.ratio == null ? null : max === 0 ? 0 : r.ratio / max * 100 }))
      .filter(r => `${r.name} ${r.code}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a,b) => sort === "weight" ? b.newWeight - a.newWeight : sort === "change" ? Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) : Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0));
  }, [latest, previous, sort, query]);
  const top = latest?.holdings.slice(0,3).reduce((sum,r) => sum+r.weight,0);
  return <div className="mx-auto max-w-5xl pb-8">
    <div className="mb-5 text-xs font-bold tracking-[0.18em] text-emerald-400">ETF HOLDINGS LAB / 국내 ETF</div>
    <h1 className="text-3xl font-bold tracking-tight">{name}</h1><p className="mt-2 text-sm leading-6 text-zinc-400">{code} · KRX 자산구성내역을 1CU 단위로 비교합니다.</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><Card title="구성 기준일" value={latest?.asOf ?? "수집 대기"} detail={stale ? `최신 완료 거래일 ${expected} 자료 미수집` : "KRX ETF 구성 공시 기준"} /><Card title="비교 기준일" value={previous?.asOf ?? "비교 자료 없음"} detail={periods[period].date ? `선택 기간 기준일 ${periods[period].date}` : "거래일 확인 필요"} /><Card title="상위 3개 비중" value={top == null ? "—" : `${top.toFixed(2)}%`} detail="현재 공개 구성 기준" /></div>
    {(!expected || stale || lastAttempt?.error) && <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-200">{!expected ? "거래일을 확인할 수 없어 데이터를 표시하지 않습니다." : stale ? "최신 거래일 수집이 완료되지 않아 이전 자료를 표시합니다. " : ""}{lastAttempt?.error ? `최근 수집 실패: ${lastAttempt.error}` : ""}</div>}
    {!latest ? <div className="mt-5 rounded-2xl border border-white/10 bg-[#141a22] p-6"><h2 className="text-lg font-bold">구성 자료 수집 대기</h2><p className="mt-2 text-sm leading-6 text-zinc-400">KRX에서 두 거래일의 구성 자료를 수집하면 수량과 비중 변화를 표시합니다. 자료가 없을 때 이전 테스트 값을 최신 자료로 대체하지 않습니다.</p></div> : <section className="mt-5 rounded-2xl border border-white/10 bg-[#141a22] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.16em] text-emerald-400">HOLDINGS CHANGE</p><h2 className="mt-2 text-xl font-bold">수량 · 비중 변화</h2><p className="mt-1 text-sm text-zinc-400">{previous ? `${previous.asOf} → ${latest.asOf}` : `${latest.asOf} 구성`} · 1CU당 수량</p></div><span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-400">{latest.holdings.length}개 종목</span></div>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="비교 기간">{periodOptions.map(([key,label]) => <button key={key} onClick={() => setPeriod(key)} aria-pressed={period === key} className={`rounded-lg px-4 py-2 text-sm ${period === key ? "bg-emerald-400 font-bold text-[#0c1813]" : "bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
      {!previous && <p className="mt-4 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200">{periods[period].date ?? "선택 기간"} 기준 자료가 없어 변화량은 표시하지 않습니다.</p>}
      <div className="mt-5 flex flex-wrap gap-2"><label className="min-w-[180px] flex-1"><span className="sr-only">종목 검색</span><input className="w-full rounded-lg border border-white/10 bg-[#0e131a] px-3 py-2.5 text-sm" placeholder="종목명 또는 종목코드 검색" value={query} onChange={e=>setQuery(e.target.value)} /></label>{([["strength","시총 대비 강도순"],["change","절대 변화율순"],["weight","비중순"]] as const).map(([key,label])=><button key={key} onClick={()=>setSort(key)} aria-pressed={sort===key} className={`rounded-lg px-3 py-2 text-sm ${sort===key ? "bg-emerald-400 font-bold text-[#0c1813]" : "bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
      <div aria-live="polite" className="mt-3">{rows.map(row=><div key={row.code} className="border-b border-white/[0.07] py-4 last:border-0"><div className="flex justify-between gap-2"><div className="font-semibold">{row.name}<span className="ml-2 text-xs font-normal text-zinc-500">{row.code}</span></div><span className={`text-sm font-bold ${color(row.delta ?? 0)}`}>{row.delta == null ? "—" : `${signed(row.delta, Number.isInteger(row.delta) ? 0 : 2)}주`}</span></div><div className="mt-2 h-1.5 rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${(row.delta ?? 0) >= 0 ? "bg-rose-400" : "bg-sky-400"}`} style={{width:`${Math.abs(row.score ?? 0)}%`}} /></div><div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs leading-5 text-zinc-400"><span>{row.oldQty == null ? "—" : row.oldQty.toLocaleString()} → {row.newQty.toLocaleString()}주 · 비중 {row.oldWeight == null ? "—" : `${row.oldWeight.toFixed(2)}%`} → {row.newWeight.toFixed(2)}% {row.oldWeight != null && <span className={color(row.newWeight-row.oldWeight)}>({signed(row.newWeight-row.oldWeight,2)}%p)</span>}</span><span>강도 <b className={color(row.score ?? 0)}>{row.score == null ? "—" : signed(row.score,1)}</b> · 변화율 <b className="text-zinc-200">{row.change == null ? row.oldQty === 0 && row.newQty > 0 ? "신규" : "—" : `${signed(row.change,1)}%`}</b></span></div></div>)}{!rows.length && <p className="py-8 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}</div>
      <div className="mt-5 rounded-xl bg-white/[0.04] p-4 text-xs leading-5 text-zinc-400"><p>1D는 전 거래일, 1W는 7일 전, 1M·3M·6M은 각각 1·3·6개월 전 기준이며 휴장일이면 그 이전의 최근 거래일을 사용합니다. 비중 변화는 퍼센트포인트(%p)입니다. 비중은 종목 가격 변화로도 달라질 수 있습니다. 수량은 ETF 전체가 아닌 1CU당 구성 수량이며 실제 매매량이 아닙니다. 기간 중 1CU 설정단위 변경이나 종목 액면분할·병합이 있었다면 수량 증감에 영향을 줄 수 있습니다.</p><p className="mt-2">강도 = 수량 증감 × 해당일 KRX 종가 ÷ 시가총액을 종목 간 최대 절댓값 100으로 정규화한 상대 점수. 가격·시총은 {latest.asOf} KRX 정규장 15:30 기준이며 자료가 없으면 강도를 표시하지 않습니다.</p><p className="mt-2">자료: KRX ETF PDF · 수집 {new Date(latest.collectedAt).toLocaleString("ko-KR", {timeZone:"Asia/Seoul"})} KST · <a className="text-emerald-400 underline" href="https://data.krx.co.kr/" target="_blank" rel="noreferrer">한국거래소</a></p></div>
    </section>}
  </div>;
}
function Card({title,value,detail}:{title:string;value:string;detail:string}) { return <div className="rounded-2xl border border-white/10 bg-[#141a22] p-5"><p className="text-xs text-zinc-400">{title}</p><p className="mt-3 text-xl font-bold">{value}</p><p className="mt-2 text-xs text-zinc-500">{detail}</p></div>; }




