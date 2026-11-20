"use client";
import { DataFreshness, latestDataTime } from "@/components/DataFreshness";

import { useCallback, useEffect, useMemo, useState } from "react";
import { stockMetrics, type StockMetric, type StockValuationData, type StockValuationSnapshot } from "@/lib/valuation/stocks";
import type { ValuationMarketCaps } from "@/lib/valuation/market-caps";
import { TradingViewChart } from "./TradingViewChart";
import { StockValuationHistory } from "./StockValuationHistory";
import { AnnualEstimateChart } from "./AnnualEstimateChart";

const timestamp = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
const format = (value: number | null | undefined, digits: number) => value == null ? "—" : value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
type Sort = "name" | "marketCap" | StockMetric;

export function StockValuationBoard() {
  const [universe, setUniverse] = useState<"kospi200" | "kosdaq150">("kospi200");
  return <div className="space-y-4"><div className="flex gap-2" aria-label="지수 선택">{([['kospi200', '코스피200'], ['kosdaq150', '코스닥150']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={universe === id} onClick={() => setUniverse(id)} className={`rounded-md border px-4 py-2 text-sm ${universe === id ? 'border-sky-400 text-sky-300' : 'border-white/15 text-zinc-400'}`}>{label}</button>)}</div><StockValuationUniverse key={universe} universe={universe} /></div>;
}
function StockValuationUniverse({ universe }: { universe: "kospi200" | "kosdaq150" }) {
  const [data, setData] = useState<StockValuationData | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState("005930");
  const [stockSearch, setStockSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [ascending, setAscending] = useState(true);
  const [positivePer, setPositivePer] = useState(false);
  const [comparison, setComparison] = useState<string[]>([]);
  const [comparisonOnly, setComparisonOnly] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<ValuationMarketCaps | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    const capRequest = (async () => {
      try {
        const response = await fetch("/api/valuation/stocks/market-caps", { cache: "no-store", signal });
        const result = await response.json() as ValuationMarketCaps & { error?: string };
        if (!response.ok || result.priceBasis !== "KRX_REGULAR_CLOSE" || !result.values) throw new Error(result.error ?? "시가총액 데이터를 읽지 못했습니다.");
        if (!signal?.aborted) { setCaps(result); setCapError(null); }
      } catch (cause) {
        if (!signal?.aborted) { setCaps(null); setCapError(cause instanceof Error ? cause.message : "시가총액 데이터를 읽지 못했습니다."); }
      }
    })();
    try {
      const response = await fetch(`/api/valuation/stocks?universe=${universe}`, { cache: "no-store", signal });
      const result = await response.json() as StockValuationSnapshot & { error?: string };
      if (!response.ok || !result.data?.stocks?.length || !result.data.metrics?.length) throw new Error(result.error ?? "개별종목 데이터를 읽지 못했습니다.");
      if (!signal?.aborted) { setData(result.data); setExportedAt(result.exportedAt); setError(null); }
    } catch (cause) {
      if (!signal?.aborted) setError(`${cause instanceof Error ? cause.message : "데이터를 읽지 못했습니다."} 기존 표시값을 유지합니다.`);
    } finally { await capRequest; if (!signal?.aborted) setBusy(false); }
  }, [universe]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  const metrics = useMemo(() => stockMetrics.filter(metric => data?.metrics.some(item => item.id === metric.id)), [data]);
  const visibleMetrics = useMemo(() => {
    if (showAllMetrics) return metrics;
    const core: StockMetric[] = ["per", "pbr", "evEbitda", "operatingProfit", "fcf"];
    return core.flatMap(id => metrics.filter(metric => metric.id === id));
  }, [metrics, showAllMetrics]);
  const active = data?.stocks.find(stock => stock.code === selected) ?? data?.stocks[0];
  const searchMatches = useMemo(() => {
    const term = stockSearch.trim().toLocaleLowerCase();
    if (!term) return [];
    return (data?.stocks ?? []).filter(stock => `${stock.name} ${stock.code}`.toLocaleLowerCase().includes(term)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [data, stockSearch]);
  const rows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (data?.stocks ?? []).filter(stock => (!comparisonOnly || comparison.includes(stock.code)) && (!term || `${stock.name} ${stock.code}`.toLocaleLowerCase().includes(term)) && (!positivePer || (stock.values.per != null && stock.values.per > 0))).sort((a, b) => {
      if (sort === "name") return (ascending ? 1 : -1) * a.name.localeCompare(b.name, "ko");
      const left = sort === "marketCap" ? caps?.values[a.code] : a.values[sort], right = sort === "marketCap" ? caps?.values[b.code] : b.values[sort];
      if (left == null) return right == null ? a.code.localeCompare(b.code) : 1;
      if (right == null) return -1;
      return (ascending ? 1 : -1) * (left - right) || a.code.localeCompare(b.code);
    });
  }, [data, caps, query, sort, ascending, positivePer, comparison, comparisonOnly]);
  function toggleComparison(code: string) {
    if (comparison.includes(code) && comparison.length === 1) setComparisonOnly(false);
    setComparison(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
  }
  function order(column: Sort) { if (sort === column) setAscending(value => !value); else { setSort(column); setAscending(column !== "marketCap"); } }

  const metricDate = latestDataTime(data?.metrics.map(metric => metric.baseDate).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) ?? []);
  return <div className="space-y-5">
    <DataFreshness basis={metricDate} updatedAt={exportedAt ?? data?.savedAt} basisDetail={metricDate ? "QuantiWise 선행 컨센서스" : data ? "QuantiWise 원본에서 날짜 미제공" : "QuantiWise 선행 컨센서스"}
      updateDetail={exportedAt ? "스냅샷 내보내기" : data ? "원본 파일 저장" : undefined} />
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="text-sm"><p className="font-medium">{data ? `${data.stocks.length}개 종목 · 구성일 ${data.compositionDate}` : "개별종목 데이터 확인 중…"}</p>
        {data && <p className="mt-1 text-xs text-zinc-400">{data.fileName} · 종목별 밸류에이션</p>}
        {data?.sourceUpdatedAt && <p className="mt-1 text-xs text-zinc-500">QuantiWise 갱신 {data.sourceUpdatedAt} KST</p>}
      </div>
      <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40">{busy ? "읽는 중…" : "데이터 반영"}</button>
    </section>
    {error && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">{error}</p>}
    {capError && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">{capError} 시총은 결측으로 표시합니다.</p>}
    {active && <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs text-zinc-500">선택 종목 · {active.code}</p><h2 className="mt-1 text-xl font-semibold">{active.name}</h2></div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <label className="block text-xs text-zinc-400" htmlFor="stock-picker-search">종목 검색</label>
            <input id="stock-picker-search" type="search" autoComplete="off" placeholder="종목명 또는 코드" value={stockSearch} onChange={event => setStockSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setStockSearch(""); }} className="mt-1 w-48 rounded-md border border-white/15 bg-[#151a22] px-3 py-2 text-sm text-zinc-200" />
            {stockSearch.trim() && <div className="absolute right-0 z-30 mt-1 max-h-60 w-64 overflow-auto rounded-md border border-white/15 bg-[#151a22] p-1 shadow-xl" aria-label="종목 검색 결과">
              {searchMatches.length ? searchMatches.map(stock => <button type="button" key={stock.code} onClick={() => { setSelected(stock.code); setStockSearch(""); }} className="block w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10 focus-visible:bg-white/10">{stock.name} <span className="text-xs text-zinc-500">{stock.code}</span></button>) : <p role="status" className="px-3 py-2 text-xs text-zinc-400">검색 결과가 없습니다.</p>}
            </div>}
          </div>
          <label className="text-xs text-zinc-400">종목 선택<select aria-label="종목 선택" value={active.code} onChange={event => { setSelected(event.target.value); setStockSearch(""); }} className="ml-3 max-w-[240px] rounded-md border border-white/15 bg-[#151a22] px-3 py-2 text-sm text-zinc-200">{[...(data?.stocks ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ko")).map(stock => <option value={stock.code} key={stock.code}>{stock.name} · {stock.code}</option>)}</select></label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{metrics.map(metric => <div key={metric.id} className="rounded-xl border border-white/10 bg-[#151a22] p-4">
        <p className="flex items-center gap-2 text-xs text-zinc-400"><span className="h-1.5 w-1.5 rounded-full" style={{ background: metric.color }} />{metric.name}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{format(active.values[metric.id], metric.digits)} <span className="text-xs font-normal text-zinc-500">{metric.unit}</span></p>
        <p className="mt-2 text-[11px] text-zinc-500">Fwd.12M · {data?.metrics.find(item => item.id === metric.id)?.baseDate || "원본 기준일 미제공"}</p>
      </div>)}</div>
      <AnnualEstimateChart code={active.code} />
      <TradingViewChart code={active.code} name={active.name} />
      <StockValuationHistory code={active.code} universe={universe} />
    </>}
    {data && <section className="overflow-hidden rounded-xl border border-white/10 bg-[#151a22]">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="font-semibold">개별종목 밸류에이션 비교</h2><p className="mt-1 text-xs text-zinc-500">{rows.length} / {data.stocks.length}종목 · 체크박스로 비교 종목을 선택하세요. 종목명을 누르면 상세와 차트가 바뀝니다.</p></div>
        <div className="flex flex-wrap items-center gap-3"><input type="search" aria-label="종목명 또는 코드 검색" placeholder="종목명 / 코드 검색" value={query} onChange={event => setQuery(event.target.value)} className="w-48 rounded-md border border-white/15 bg-[#10141b] px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={positivePer} onChange={event => setPositivePer(event.target.checked)} />PER 양수만</label></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
        <label className="text-xs text-zinc-400">시총 정렬 <select aria-label="시총 정렬" value={sort === "marketCap" ? ascending ? "asc" : "desc" : "none"} onChange={event => { if (event.target.value === "none") { setSort("name"); setAscending(true); } else { setSort("marketCap"); setAscending(event.target.value === "asc"); } }} className="ml-2 rounded-md border border-white/15 bg-[#10141b] px-3 py-2 text-sm"><option value="none">선택 안 함</option><option value="desc">시총 큰 순</option><option value="asc">시총 작은 순</option></select></label>
        {caps && <p className="text-xs text-zinc-500">시총 기준 {caps.asOf} · KRX {caps.priceTime} 종가 · 수집 {timestamp(caps.fetchedAt)} KST</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4" aria-label="비교 종목 선택">
        <span className="mr-1 text-xs text-zinc-400">비교 종목 {comparison.length}개</span>
        {comparison.map(code => { const stock = data.stocks.find(item => item.code === code); return <button key={code} type="button" onClick={() => toggleComparison(code)} aria-label={`${stock?.name ?? code} 비교에서 제외`} className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">{stock?.name ?? code} ×</button>; })}
        <button type="button" disabled={!comparison.length} aria-pressed={comparisonOnly} onClick={() => { setComparisonOnly(value => !value); setQuery(''); setPositivePer(false); }} className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-zinc-200 disabled:opacity-40">{comparisonOnly ? '전체 종목 보기' : '선택 종목만 비교'}</button>
        {comparison.length > 0 && <button type="button" onClick={() => { setComparison([]); setComparisonOnly(false); }} className="text-xs text-zinc-400 hover:text-white">선택 초기화</button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-4 py-3">
        <div className="flex rounded-lg border border-white/10 bg-[#10141b] p-1" aria-label="표시 지표">
          <button type="button" aria-pressed={!showAllMetrics} onClick={() => { setShowAllMetrics(false); if (sort !== "name" && sort !== "marketCap" && !["per", "pbr", "evEbitda", "operatingProfit", "fcf"].includes(sort)) { setSort("name"); setAscending(true); } }} className={`rounded-md px-3 py-1.5 text-xs ${!showAllMetrics ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>핵심 지표</button>
          <button type="button" aria-pressed={showAllMetrics} onClick={() => setShowAllMetrics(true)} className={`rounded-md px-3 py-1.5 text-xs ${showAllMetrics ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>전체 지표</button>
        </div>
        <p className="text-xs text-zinc-400">열 제목을 눌러 정렬 · 좌우로 스크롤</p>
      </div>
      <div className="max-h-[600px] overflow-auto"><table className="w-full whitespace-nowrap text-right text-sm">
        <caption className="sr-only">QuantiWise 개별종목 12개월 선행 밸류에이션 및 KRX 종가 기준 시가총액. 열 제목을 누르면 정렬되며 결측은 마지막에 표시됩니다.</caption>
        <thead className="sticky top-0 z-20 bg-[#202733] text-xs text-zinc-300"><tr>
          <th scope="col" aria-sort={sort === "name" ? ascending ? "ascending" : "descending" : "none"} className="sticky left-0 z-30 min-w-[180px] border-r border-white/10 bg-[#202733] px-4 py-3 text-left"><button type="button" onClick={() => order("name")} className="hover:text-white">종목 / 비교 {sort === "name" ? ascending ? "↑" : "↓" : "↕"}</button></th>
          <th scope="col" aria-sort={sort === "marketCap" ? ascending ? "ascending" : "descending" : "none"} className="min-w-[120px] px-4 py-3"><button type="button" onClick={() => order("marketCap")} className="hover:text-white">시가총액 {sort === "marketCap" ? ascending ? "↑" : "↓" : "↕"}<span className="mt-1 block text-[11px] font-normal text-zinc-400">억원</span></button></th>
          {visibleMetrics.map(metric => <th scope="col" key={metric.id} aria-sort={sort === metric.id ? ascending ? "ascending" : "descending" : "none"} className={`min-w-[125px] px-4 py-3 ${sort === metric.id ? "text-sky-300" : ""}`}><button type="button" onClick={() => order(metric.id)} className="hover:text-white">{metric.name} {sort === metric.id ? ascending ? "↑" : "↓" : "↕"}<span className="mt-1 block text-[11px] font-normal text-zinc-400">{metric.unit}</span></button></th>)}
        </tr></thead>
        <tbody>{rows.map((stock, index) => <tr key={stock.code} className={`border-t border-white/[0.06] ${active?.code === stock.code ? "bg-sky-400/[0.08]" : index % 2 ? "bg-white/[0.025]" : ""}`}>
          <th scope="row" className={`sticky left-0 z-10 border-r border-white/10 px-4 py-3 text-left font-normal ${active?.code === stock.code ? "bg-[#192c3a]" : index % 2 ? "bg-[#1b2028]" : "bg-[#151a22]"}`}><div className="flex items-center gap-3"><input type="checkbox" aria-label={`${stock.name} 비교에 선택`} checked={comparison.includes(stock.code)} onChange={() => toggleComparison(stock.code)} /><button type="button" aria-pressed={active?.code === stock.code} onClick={() => setSelected(stock.code)} className="text-left text-sm font-medium text-zinc-100 hover:text-sky-400"><span className="block">{stock.name}</span><span className="text-xs font-normal text-zinc-400">{stock.code}{active?.code === stock.code ? " · 선택됨" : ""}</span></button></div></th>
          <td className="px-4 py-3 tabular-nums text-zinc-200">{format(caps?.values[stock.code] == null ? null : caps.values[stock.code]! / 1e8, 0)}</td>
          {visibleMetrics.map(metric => <td key={metric.id} className={`px-4 py-3 tabular-nums ${stock.values[metric.id] == null ? "text-zinc-500" : stock.values[metric.id]! < 0 ? "text-sky-300" : "text-zinc-100"}`}>{format(stock.values[metric.id], metric.digits)}</td>)}
        </tr>)}</tbody>
      </table>{rows.length === 0 && <p role="status" className="py-12 text-center text-sm text-zinc-500">검색 조건에 맞는 종목이 없습니다.</p>}</div>
    </section>}
    {!data && !busy && <p className="rounded-xl border border-dashed border-white/15 py-16 text-center text-sm text-zinc-400">데이터를 불러오지 못했습니다. ‘데이터 반영’을 다시 눌러 주세요.</p>}
    <div className="space-y-1 text-xs leading-relaxed text-zinc-500">
      <p>밸류에이션 출처: QuantiWise Peer Analysis · Fwd.12M. CPD-1TD는 원본 조회일의 직전 거래일 기준입니다.</p>
      <p>시가총액 출처: KRX 일별매매정보 · 표시 기준일의 KRX 정규장 종가 기준입니다. 2026-11-19에는 16:30에 마감했습니다. 시총 열을 누르면 큰 순·작은 순으로 정렬하며 결측은 마지막에 표시합니다.</p>
      <p>밸류에이션 이력은 저장된 조회일의 스냅샷입니다. 원본 지표의 실제 기준일과 가격 거래소는 확인되지 않았습니다. 결측은 —로, 0과 음수는 원본대로 표시합니다.</p>
      <p>영업이익·FCF는 천원에서 억원으로 환산합니다. 로컬 내보내기 후 배포하고 ‘데이터 반영’을 눌러 주세요.</p>
    </div>
  </div>;
}
