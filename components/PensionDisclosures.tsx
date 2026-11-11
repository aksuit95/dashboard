"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PensionPublication } from "@/lib/pension/source";

const chip = (active: boolean) => `rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-rose-500/50 bg-rose-950 text-rose-100" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/10"}`;
const display = (value: number | null, suffix: string, signed = false) => value == null ? "—" : `${signed && value > 0 ? "+" : ""}${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${suffix}`;
const tone = (value: number | null) => value == null || value === 0 ? "text-zinc-500" : value > 0 ? "text-rose-400" : "text-sky-400";
export function PensionDisclosures() {
  const [data, setData] = useState<PensionPublication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "major" | "executive">("all");
  const [direction, setDirection] = useState<"all" | "increase" | "decrease">("all");
  const [sort, setSort] = useState("latest");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/investor-flow/pension", { signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "공시 조회 실패"); setData(body);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  const rows = useMemo(() => {
    const filtered = (data?.rows ?? []).filter(row => (kind === "all" || row.type === kind) && (direction === "all" || (row.changeShares != null && (direction === "increase" ? row.changeShares > 0 : row.changeShares < 0))));
    return [...filtered].sort((a,b) => sort === "oldest" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));
  }, [data, kind, direction, sort]);
  const counts = { increase: data?.rows.filter(r => r.changeShares != null && r.changeShares > 0).length ?? 0, decrease: data?.rows.filter(r => r.changeShares != null && r.changeShares < 0).length ?? 0, major: data?.rows.filter(r => r.type === "major").length ?? 0, executive: data?.rows.filter(r => r.type === "executive").length ?? 0 };
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">국민연금 전체 공시</h1><p className="mt-2 text-sm text-zinc-400">국민연금공단이 제출한 지분 공시를 모아봅니다.</p></div>
    <div className="flex flex-wrap gap-2"><Link href="/investor-flow/kospi200" className={chip(false)}>코스피 시장</Link><Link href="/investor-flow/kosdaq150" className={chip(false)}>코스닥 시장</Link><Link href="/investor-flow/kospi200/stocks" className={chip(false)}>코스피200 종목</Link><Link href="/investor-flow/kosdaq150/stocks" className={chip(false)}>코스닥150 종목</Link><span className={chip(true)}>국민연금 공시</span></div>
    <section className="rounded-xl border border-white/10 bg-[#151a22] p-5">
      <div className="flex flex-wrap gap-2 text-xs text-zinc-400"><span className="rounded bg-sky-400/10 px-2 py-1 text-sky-300">{data ? `${Number(data.month.slice(5))}월 공시` : "공시 조회"}</span><span className="rounded bg-white/5 px-2 py-1">최근 제출일 {data?.rows[0]?.filedAt ?? "—"}</span></div>
      <p className="mt-4 text-sm text-zinc-400">{data ? `${data.month} 기준` : "월별"} 국민연금 지분 공시</p><p className="mt-1 text-3xl font-bold">{data ? data.rows.length : "—"}<span className="ml-1 text-sm text-zinc-500">건</span></p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs"><span className="text-rose-400">▲ 보유수량 증가 {counts.increase}</span><span className="text-sky-400">▼ 보유수량 감소 {counts.decrease}</span><span className="text-zinc-400">대량보유 {counts.major} · 임원주요주주 {counts.executive}</span></div>
      {data && <p className="mt-3 text-xs text-zinc-500">수집 {new Date(data.collectedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} KST · 상세 미반영 {data.rows.filter(r=>r.detailPending).length}건</p>}
    </section>
    <p className="rounded-xl border border-white/10 bg-[#151a22] px-5 py-4 text-xs leading-6 text-zinc-400">대량보유와 임원·주요주주 소유상황 보고서를 함께 표시합니다. 제출일은 DART 접수일입니다. 보유수량 증감은 보고된 수치이며 실제 매수·매도를 뜻하지 않을 수 있습니다. 정정 공시는 원문을 확인해 주세요.</p>
    <div className="flex flex-wrap items-center gap-2"><select aria-label="제출일 정렬" value={sort} onChange={e=>setSort(e.target.value)} className="rounded-full border border-white/10 bg-[#151a22] px-3 py-1.5 text-xs"><option value="latest">제출일 최신순</option><option value="oldest">제출일 오래된순</option></select>{([["all","전체 증감"],["increase","수량 증가"],["decrease","수량 감소"]] as const).map(([key,label])=><button key={key} onClick={()=>setDirection(key)} aria-pressed={direction===key} className={chip(direction===key)}>{label}</button>)}</div>
    <div className="flex flex-wrap gap-2">{([["all","전체"],["major","5% 이상 대량보유"],["executive","임원·주요주주"]] as const).map(([key,label])=><button key={key} onClick={()=>setKind(key)} aria-pressed={kind===key} className={chip(kind===key)}>{label}</button>)}</div>
    {error && <p role="status" className="rounded-lg bg-amber-400/10 p-4 text-sm text-amber-200">{error}</p>}
    {!data && !error && <p className="text-sm text-zinc-400">저장된 공시를 불러오는 중입니다…</p>}
    {data && <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#151a22]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-zinc-500"><tr><th className="p-4">회사</th><th className="p-4 text-right">최종 지분</th><th className="p-4 text-right">증감률 (%p)</th><th className="p-4 text-right">증감 주식수</th><th className="p-4">제출일</th><th className="p-4">비고</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-b border-white/5 last:border-0"><td className="p-4"><span className="mr-2 rounded bg-violet-500/15 px-1.5 py-1 text-xs text-violet-300">{row.type === "major" ? "대량" : "임원"}</span><a className="font-semibold hover:underline" href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row.id}`} target="_blank" rel="noreferrer">{row.company}</a><span className="ml-2 text-xs text-zinc-500">{row.code}</span></td><td className="p-4 text-right tabular-nums">{display(row.holding,"%")}</td><td className={`p-4 text-right tabular-nums ${tone(row.changeRate)}`}>{display(row.changeRate,"%p",true)}</td><td className={`p-4 text-right tabular-nums ${tone(row.changeShares)}`}>{display(row.changeShares,"주",true)}</td><td className="p-4 text-zinc-400">{row.filedAt}</td><td className="p-4 text-xs text-zinc-400">{row.corrected ? "정정 · " : ""}{row.detailPending ? "상세 반영 대기" : row.reason || "—"}</td></tr>)}</tbody></table>{rows.length===0 && <p className="p-8 text-center text-sm text-zinc-500">표시할 공시가 없습니다.</p>}</div>}
  </div>;
}
