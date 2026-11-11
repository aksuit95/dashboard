"use client";
import { useMemo, useState } from "react";
import { semiconductorEtfs } from "@/lib/etf/config";
import { commonChanges } from "@/lib/etf/common";
import { comparisonDate, selectComparison, periodOptions, type Period, type Publication, type Snapshot } from "@/lib/etf/holdings";
import { EtfHoldingsBoard } from "@/components/EtfHoldingsBoard";
import { EtfFundMetrics } from "@/components/EtfFundMetrics";

export function SemiconductorBoard({ publication, expected }: { publication: Publication; expected: string | null }) {
  const [selected, setSelected] = useState<string>("common");
  const [period, setPeriod] = useState<Period>("1d");
  const compare = useMemo(() => {
    let date: string | null = null;
    try { if (expected) date = comparisonDate(expected, period); } catch { /* fail closed */ }
    const pairs = date && expected ? semiconductorEtfs.flatMap(etf => {
      const before = publication.snapshots.find(s => (s.etfCode ?? "396500") === etf.code && s.asOf === date);
      const after = publication.snapshots.find(s => (s.etfCode ?? "396500") === etf.code && s.asOf === expected);
      return before && after ? [{ etfCode: etf.code, before, after }] : [];
    }) : [];
    return {date, pairs, ...commonChanges(pairs)};
  }, [publication, expected, period]);
  const etf = semiconductorEtfs.find(e => e.code === selected);
  let board: { latest: Snapshot | null; stale: boolean } = {latest: null, stale: false};
  if (expected && etf) board = selectComparison(publication, expected, etf.code);
  const periods: Record<Period, {date: string | null; snapshot: Snapshot | null}> = {"1d": {date:null,snapshot:null}, "1w": {date:null,snapshot:null}, "1m": {date:null,snapshot:null}, "3m": {date:null,snapshot:null}, "6m": {date:null,snapshot:null}};
  if (board.latest && etf) for (const [key] of periodOptions) {
    try { const date = comparisonDate(board.latest.asOf, key); periods[key] = {date, snapshot: publication.snapshots.find(s => (s.etfCode ?? "396500") === etf.code && s.asOf === date) ?? null}; } catch { /* calendar not confirmed */ }
  }
  return <div className="mx-auto max-w-5xl"><div className="mb-6"><p className="text-xs font-semibold tracking-[0.18em] text-emerald-400">ETF HOLDINGS LAB</p><h1 className="mt-3 text-2xl font-bold">반도체 ETF</h1><p className="mt-2 text-sm text-zinc-400">국내 반도체 ETF 6개의 구성 변화를 비교합니다.</p><div className="mt-5 flex flex-wrap gap-2" aria-label="ETF 선택"><button onClick={()=>setSelected("common")} aria-pressed={selected === "common"} className={`rounded-lg px-3 py-2 text-sm ${selected === "common" ? "bg-emerald-400 font-bold text-[#0c1813]" : "bg-white/5 text-zinc-300"}`}>공통 수량 변화</button>{semiconductorEtfs.map(e=><button key={e.code} onClick={()=>setSelected(e.code)} aria-pressed={selected === e.code} className={`rounded-lg px-3 py-2 text-sm ${selected === e.code ? "bg-emerald-400 font-bold text-[#0c1813]" : "bg-white/5 text-zinc-300"}`}>{e.name}</button>)}</div></div>
    <EtfFundMetrics publication={publication} expected={expected} selected={selected} period={period} />
    {etf ? <EtfHoldingsBoard name={etf.name} code={etf.code} latest={board.latest} periods={periods} expected={expected} stale={board.stale} lastAttempt={publication.lastAttempt} period={period} setPeriod={setPeriod}/> : <section className="rounded-2xl border border-white/10 bg-[#141a22] p-5 sm:p-6"><p className="text-xs font-bold tracking-[0.16em] text-emerald-400">COMMON CHANGES</p><h2 className="mt-2 text-xl font-bold">여러 ETF가 함께 늘리거나 줄인 종목</h2><p className="mt-2 text-sm leading-6 text-zinc-400">같은 기간에 2개 이상의 ETF에서 1CU당 구성 수량이 같은 방향으로 변한 종목입니다.</p><div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="비교 기간">{periodOptions.map(([key,label])=><button key={key} onClick={()=>setPeriod(key)} aria-pressed={period === key} className={`rounded-lg px-4 py-2 text-sm ${period===key ? "bg-emerald-400 font-bold text-[#0c1813]" : "bg-white/5 text-zinc-400"}`}>{label}</button>)}</div><p className="mt-4 text-sm text-zinc-400">{compare.date ?? "기준일 미확인"} → {expected ?? "최신 거래일 미확인"} · 비교 가능 {compare.pairs.length}/{semiconductorEtfs.length}개 ETF</p>{compare.pairs.length < semiconductorEtfs.length && <p className="mt-2 text-sm text-amber-300">자료가 부족한 ETF는 공통 비교에서 제외했습니다. 제외: {semiconductorEtfs.filter(e=>!compare.pairs.some(p=>p.etfCode===e.code)).map(e=>e.name).join(", ")}</p>}
      {([ ["공통 수량 증가", compare.increase, "text-rose-400"], ["공통 수량 감소", compare.decrease, "text-sky-400"] ] as const).map(([title, rows, tone])=><div key={title} className="mt-7"><div className="flex justify-between"><h3 className={`text-lg font-bold ${tone}`}>{title}</h3><span className="text-sm text-zinc-500">{rows.length}종목</span></div>{rows.length ? rows.map(row=><div key={row.code} className="border-b border-white/[0.07] py-4"><div className="flex justify-between gap-2"><div className="font-semibold">{row.name} <span className="ml-1 text-xs font-normal text-zinc-500">{row.code}</span></div><span className={`text-sm font-bold ${tone}`}>{row.entries.length}개 ETF</span></div><div className="mt-2 space-y-1">{row.entries.map(e=><div key={e.etfCode} className="flex flex-wrap justify-between gap-x-2 text-xs leading-5 text-zinc-400"><span>{e.etfName}</span><span>{e.before.toLocaleString()} → {e.after.toLocaleString()}주 <b className={tone}>({e.delta > 0 ? "+" : ""}{e.delta.toLocaleString()}주)</b></span></div>)}</div></div>) : <p className="py-5 text-sm text-zinc-500">{compare.pairs.length < 2 ? "비교 가능한 ETF 자료가 부족합니다." : "해당 기간에 공통으로 변한 종목이 없습니다."}</p>}</div>)}
      <div className="mt-5 rounded-xl bg-white/[0.04] p-4 text-xs leading-5 text-zinc-400">수량은 ETF 전체 보유량이 아닌 1CU당 자산구성내역입니다. 수량 증감은 실제 매수·매도 체결이나 자금 유입을 의미하지 않습니다. 기간 중 1CU 설정단위 변경이나 종목 액면분할·병합이 있으면 수량 변화에 영향을 줄 수 있습니다. 같은 종목이 일부 ETF에서는 증가하고 다른 ETF에서는 감소할 수 있어 양쪽 목록에 모두 나올 수 있습니다. 1D는 전 거래일, 1W는 7일 전, 1M·3M·6M은 각각 1·3·6개월 전을 기준으로 하며 휴장일이면 이전 거래일을 사용합니다.</div>
    </section>}
  </div>;
}


