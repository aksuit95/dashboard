"use client";

import { useMemo, useState } from "react";
import { EtfChanges } from "@/components/EtfChanges";

// Published holdings snapshot; the provider reports its own portfolio and valuation dates.
const holdings = [
  { name: "삼성전자", code: "005930", weight: 27.88 },
  { name: "SK하이닉스", code: "000660", weight: 26.03 },
  { name: "SK스퀘어", code: "402340", weight: 24.44 },
  { name: "한미반도체", code: "042700", weight: 5.15 },
  { name: "주성엔지니어링", code: "036930", weight: 4.23 },
  { name: "이수페타시스", code: "007660", weight: 3.10 },
  { name: "DB하이텍", code: "000990", weight: 2.27 },
  { name: "이오테크닉스", code: "039030", weight: 2.27 },
  { name: "리노공업", code: "058470", weight: 2.08 },
  { name: "원익IPS", code: "240810", weight: 1.93 },
];
const source = "https://to-plus.co.kr/discover/etf/product/K55301DL2400";

export function EtfHoldingsBoard({ market }: { market: Record<string, { close: number | null; cap: number | null }> }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"weight" | "name">("weight");
  const rows = useMemo(() => holdings.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase().trim())).sort((a, b) => sort === "weight" ? b.weight - a.weight : a.name.localeCompare(b.name, "ko")), [query, sort]);
  const topThree = holdings.slice(0, 3).reduce((sum, item) => sum + item.weight, 0);
  const topTen = holdings.reduce((sum, item) => sum + item.weight, 0);

  return (
    <div className="mx-auto max-w-6xl pb-8 text-[#e9edf5]">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span className="font-semibold uppercase tracking-[0.18em] text-emerald-400">ETF HOLDINGS LAB <span className="ml-2 text-zinc-600">/</span> 국내 ETF</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">테스트 화면 · 저장된 스냅샷</span>
      </div>
      <header className="mb-7">
        <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-md bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">국내 주식형</span><span className="text-sm text-zinc-500">396500 · 미래에셋자산운용</span></div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">TIGER 반도체TOP10</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">국내 반도체 기업에 투자하는 ETF입니다. 어떤 종목을 얼마나 담고 있는지 한눈에 살펴보세요.</p>
      </header>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Summary label="상위 3개 종목 비중" value={`${topThree.toFixed(2)}%`} detail="삼성전자 · SK하이닉스 · SK스퀘어" accent />
        <Summary label="상위 10개 종목 비중" value={`${topTen.toFixed(2)}%`} detail="공개된 상위 10개 종목의 합계" />
        <Summary label="구성 정보 기준일" value="2026.11.10" detail="제공처 표기 · 11.09 종가 기준" />
      </div>
      <EtfChanges market={market} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-2xl border border-white/10 bg-[#141a22] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">PORTFOLIO</p><h2 className="mt-2 text-xl font-bold">보유 종목 TOP 10</h2><p className="mt-1 text-sm text-zinc-400">ETF 안에서 각 종목이 차지하는 비중입니다.</p></div>
            <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-400">10개 종목 공개</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
            <label className="min-w-[180px] flex-1"><span className="sr-only">종목 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명 또는 종목코드 검색" className="w-full rounded-lg border border-white/10 bg-[#0e131a] px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-400/60" /></label>
            <label><span className="sr-only">정렬 기준</span><select value={sort} onChange={(event) => setSort(event.target.value as "weight" | "name")} className="rounded-lg border border-white/10 bg-[#0e131a] px-3 py-2.5 text-sm text-zinc-300"><option value="weight">비중 높은 순</option><option value="name">이름 순</option></select></label>
          </div>
          <div aria-live="polite">
            {rows.map((item) => <div key={item.code} className="grid grid-cols-[32px_minmax(0,1fr)_68px] items-center gap-3 border-b border-white/[0.06] py-4 last:border-0"><span className="text-sm tabular-nums text-zinc-600">{String(holdings.indexOf(item) + 1).padStart(2, "0")}</span><div className="min-w-0"><div className="flex items-baseline gap-2"><span className="truncate text-sm font-semibold sm:text-base">{item.name}</span><span className="text-xs text-zinc-600">{item.code}</span></div><div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${item.weight / holdings[0].weight * 100}%`, opacity: holdings.indexOf(item) < 3 ? 1 : 0.52 }} /></div></div><span className="text-right text-sm font-semibold tabular-nums">{item.weight.toFixed(2)}<span className="ml-0.5 text-xs text-zinc-500">%</span></span></div>)}
            {!rows.length && <p className="py-12 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">막대는 가장 비중이 큰 종목을 기준으로 표시합니다. 상위 10개 외 자산은 목록에 포함되지 않습니다.</p>
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-emerald-400/15 bg-[#15241f] p-5"><p className="text-xs font-semibold tracking-wide text-emerald-400">한눈에 보기</p><h2 className="mt-3 text-lg font-bold leading-7">상위 3개 종목에<br />{topThree.toFixed(2)}% 집중</h2><p className="mt-3 text-sm leading-6 text-zinc-400">세 종목의 비중 합계입니다. 이 종목들의 움직임이 ETF에 미치는 영향이 상대적으로 클 수 있습니다.</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#141a22] p-5"><p className="text-xs font-semibold tracking-wide text-zinc-500">변화 추적</p><h2 className="mt-3 text-base font-bold">두 시점의 수량 비교</h2><p className="mt-2 text-sm leading-6 text-zinc-400">위 변화 분석은 10월 1일과 11월 9일의 1CU당 수량을 비교합니다. 연속된 일별 추적은 아직 제공하지 않습니다.</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#141a22] p-5"><p className="text-xs font-semibold tracking-wide text-zinc-500">데이터 안내</p><p className="mt-3 text-sm leading-6 text-zinc-400">2026.11.10 구성 정보<br />제공처 표기: 11.09 종가 기준</p><p className="mt-2 text-xs leading-5 text-zinc-500">2026.11.11 확인한 고정 자료입니다. 자동 갱신되지 않으며 현재 구성과 다를 수 있습니다. 종가의 거래소는 원자료에서 확인되지 않아 가격 비교에는 사용하지 않습니다.</p><a href={source} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300">원본 자료 보기 ↗</a></div>
        </aside>
      </div>
    </div>
  );
}

function Summary({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className="rounded-2xl border border-white/10 bg-[#141a22] p-5"><p className="text-xs font-medium text-zinc-400">{label}</p><p className={`mt-3 text-2xl font-bold tracking-tight ${accent ? "text-emerald-400" : "text-white"}`}>{value}</p><p className="mt-2 text-xs text-zinc-500">{detail}</p></div>;
}
