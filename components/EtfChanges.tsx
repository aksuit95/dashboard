"use client";
import { useState } from "react";

type Market = Record<string, { close: number | null; cap: number | null }>;
const data = [
  ["삼성전자", "005930", 1954, 1839], ["SK하이닉스", "000660", 250, 287], ["SK스퀘어", "402340", 349, 424],
  ["한미반도체", "042700", 500, 402], ["주성엔지니어링", "036930", 478, 374], ["이수페타시스", "007660", 777, 615],
  ["DB하이텍", "000990", 430, 345], ["이오테크닉스", "039030", 117, 95], ["리노공업", "058470", 632, 561], ["원익IPS", "240810", 466, 361],
] as const;
const signed = (n: number, digits = 0) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

export function EtfChanges({ market }: { market: Market }) {
  const [sort, setSort] = useState<"strength" | "change">("strength");
  const computed = data.map(([name, code, before, after]) => {
    const delta = after - before;
    const quote = market[code];
    const ratio = quote?.close && quote?.cap ? delta * quote.close / quote.cap : null;
    return { name, code, before, after, delta, change: delta / before * 100, ratio };
  });
  const max = Math.max(0, ...computed.map(row => Math.abs(row.ratio ?? 0)));
  const rows = computed.sort((a, b) => sort === "strength" ? Math.abs(b.ratio ?? 0) - Math.abs(a.ratio ?? 0) : Math.abs(b.change) - Math.abs(a.change));
  return <section className="mb-5 rounded-2xl border border-white/10 bg-[#141a22] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">HOLDINGS CHANGE</p><h2 className="mt-2 text-xl font-bold">보유 수량 변화</h2><p className="mt-1 text-sm leading-6 text-zinc-400">2026.10.01 → 2026.11.09 · 1CU당 수량 비교</p></div><span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">두 시점 비교 · 일간 변화 아님</span></div>
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="변화 정렬"><button type="button" onClick={() => setSort("strength")} className={`rounded-lg px-3 py-2 text-sm ${sort === "strength" ? "bg-emerald-400 font-bold text-[#0c1813]" : "bg-white/5 text-zinc-400"}`}>시총 대비 강도순</button><button type="button" onClick={() => setSort("change")} className={`rounded-lg px-3 py-2 text-sm ${sort === "change" ? "bg-emerald-400 font-bold text-[#0c1813]" : "bg-white/5 text-zinc-400"}`}>절대 변화율순</button></div>
    <p className="mt-4 text-xs leading-5 text-zinc-400">강도는 수량 변화의 추정 금액을 시가총액과 비교해, 변화 규모가 가장 큰 종목을 100으로 놓은 상대 점수입니다. 절대 변화율순은 증가·감소 방향과 관계없이 변화율 크기로 정렬합니다.</p>
    <div className="mt-3">{rows.map(row => { const score = row.ratio != null && max ? row.ratio / max * 100 : null; return <div key={row.code} className="border-b border-white/[0.07] py-4 last:border-0"><div className="flex items-center justify-between gap-2"><div><span className="font-semibold">{row.name}</span><span className="ml-2 text-xs text-zinc-600">{row.code}</span></div><span className={`text-sm font-bold tabular-nums ${row.delta > 0 ? "text-rose-400" : "text-sky-400"}`}>{signed(row.delta)}주</span></div><div className="mt-2 h-1.5 rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${row.delta > 0 ? "bg-rose-400" : "bg-sky-400"}`} style={{ width: `${score == null ? 0 : Math.abs(score)}%` }} /></div><div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-zinc-400"><span>{row.before.toLocaleString()} → {row.after.toLocaleString()}주 / 1CU</span><span>시총 대비 강도 <b className={row.delta > 0 ? "text-rose-400" : "text-sky-400"}>{score == null ? "확인 불가" : signed(score, 1)}</b> · 변화율 <b className="text-zinc-200">{signed(row.change, 1)}%</b></span></div></div>; })}</div>
    <div className="mt-5 rounded-xl bg-white/[0.04] p-4 text-xs leading-5 text-zinc-400"><p>강도 = (1CU당 수량 증감 × KRX 종가 ÷ 시가총액) ÷ 전체 종목 중 해당 비율의 최대 절댓값 × 100. 양수는 증가, 음수는 감소입니다.</p><p className="mt-2">변화율 = (나중 수량 − 이전 수량) ÷ 이전 수량 × 100. 수량은 ETF 전체 보유량이 아닌 1CU 기준 구성 수량으로, 실제 매매량이나 자금 유입을 뜻하지 않습니다.</p><p className="mt-2">종가·시가총액: 2026.11.10 KRX 정규장 15:30 기준. 수량 자료보다 하루 뒤의 가격으로 환산한 비교 지표입니다. <a className="text-emerald-400 underline" href="https://etfro.com/etf/396500" target="_blank" rel="noreferrer">11.09 구성 출처</a> · <a className="text-emerald-400 underline" href="https://ai.zeroin.co.kr/etf/396500" target="_blank" rel="noreferrer">10.01 구성 출처</a> (검색 시점 보관 자료)</p></div>
  </section>;
}
