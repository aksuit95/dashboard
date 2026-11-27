"use client";

import { useMemo, useState } from "react";
import { StockChartButton } from "@/components/StockChartProvider";
import { radarSignal, radarThresholds, type RadarMarket, type RadarMetrics, type RadarPeriod, type RadarRow, type RadarTab } from "@/lib/stock-radar/model";

const periodLabels: Record<RadarPeriod, string> = { "1m": "1개월", "3m": "3개월", "52w": "52주" };
const marketLabels = { ALL: "전체 시장", KOSPI: "코스피", KOSDAQ: "코스닥" };
const tabs = [
  { id: "high", label: "신고가", detail: "직전 기간 최고 종가 돌파", tone: "text-rose-300" },
  { id: "low", label: "신저가", detail: "직전 기간 최저 종가 이탈", tone: "text-sky-300" },
  { id: "drawdown", label: "낙폭과대", detail: "기간 고점 대비 현재 낙폭", tone: "text-amber-200" },
] as const;
const priceFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const eokFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const wonPerEok = 100_000_000;
const formatPrice = (value: number | null) => value == null ? "—" : priceFormat.format(value);
const formatEok = (value: number | null) => value == null ? "—" : eokFormat.format(value / wonPerEok);
const formatPct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const inputStyle = "mt-1 block rounded-md border border-white/15 bg-[#10151c] px-3 py-2 text-sm text-zinc-100";
const pageSize = 40;

type Candidate = { row: RadarRow; metrics: RadarMetrics; signal: number };
type SortColumn = "name" | "close" | "reference" | "signal" | "mdd" | "marketCap" | "turnover";
type SortDirection = "ascending" | "descending";
type Sort = { column: SortColumn; direction: SortDirection };

function referencePoint(metrics: RadarMetrics, tab: RadarTab) {
  return tab === "high" ? metrics.priorHigh : tab === "low" ? metrics.priorLow : metrics.currentPeak;
}

function SortHeader({ label, direction, onSort, left = false }: {
  label: string; direction?: SortDirection; onSort: () => void; left?: boolean;
}) {
  return <th scope="col" aria-sort={direction} className={`px-4 py-3 font-medium ${left ? "text-left" : ""}`}>
    <button type="button" onClick={onSort} className={direction ? "text-zinc-100" : "hover:text-white"}>
      {label} <span aria-hidden="true">{direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}</span>
    </button>
  </th>;
}

export function StockRadarBoard({ rows, asOf, fetchedAt }: { rows: RadarRow[]; asOf: string; fetchedAt: string }) {
  const [tab, setTab] = useState<RadarTab>("high");
  const [period, setPeriod] = useState<RadarPeriod>("52w");
  const [market, setMarket] = useState<RadarMarket | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [turnover, setTurnover] = useState("");
  const [marketCap, setMarketCap] = useState("");
  const [threshold, setThreshold] = useState<number>(radarThresholds[0]);
  const [sort, setSort] = useState<Sort | null>(null);
  const [page, setPage] = useState(1);

  const marketRows = useMemo(() => rows.filter(row => market === "ALL" || row.market === market), [rows, market]);
  const analyzable = marketRows.filter(row => row.metrics[period]).length;
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const minimumTurnover = Math.max(0, Number(turnover)) * wonPerEok;
    const minimumCap = Math.max(0, Number(marketCap)) * wonPerEok;
    const candidates: Record<RadarTab, Candidate[]> = { high: [], low: [], drawdown: [] };
    for (const row of marketRows) {
      const metrics = row.metrics[period];
      if (!metrics || !`${row.name} ${row.code}`.toLowerCase().includes(needle) ||
          (minimumTurnover > 0 && (row.turnover == null || row.turnover < minimumTurnover)) ||
          (minimumCap > 0 && (row.marketCap == null || row.marketCap < minimumCap))) continue;
      for (const { id } of tabs) {
        const signal = radarSignal(metrics, id, threshold);
        if (signal !== null) candidates[id].push({ row, metrics, signal });
      }
    }
    return candidates;
  }, [marketCap, marketRows, period, query, threshold, turnover]);
  const defaultDirection: SortDirection = tab === "high" ? "descending" : "ascending";
  const { column, direction }: Sort = sort && (sort.column !== "mdd" || tab === "drawdown")
    ? sort : { column: "signal", direction: defaultDirection };
  const visible = useMemo(() => {
    const numberAt: Record<Exclude<SortColumn, "name">, (candidate: Candidate) => number | null> = {
      close: candidate => candidate.row.close,
      reference: candidate => referencePoint(candidate.metrics, tab).price,
      signal: candidate => candidate.signal,
      mdd: candidate => candidate.metrics.mddPct,
      marketCap: candidate => candidate.row.marketCap,
      turnover: candidate => candidate.row.turnover,
    };
    const order = direction === "descending" ? -1 : 1;
    return [...matches[tab]].sort((a, b) => {
      const signalOrder = tab === "high" ? b.signal - a.signal : a.signal - b.signal;
      const tie = signalOrder || a.row.code.localeCompare(b.row.code);
      if (column === "name") return order * a.row.name.localeCompare(b.row.name, "ko") || tie;
      const left = numberAt[column](a), right = numberAt[column](b);
      if (left == null || right == null) return Number(left == null) - Number(right == null) || tie;
      return order * (left - right) || tie;
    });
  }, [matches, tab, column, direction]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  const active = tabs.find(item => item.id === tab)!;
  const signalLabel = tab === "high" ? "돌파율" : tab === "low" ? "이탈률" : "현재 낙폭";
  const referenceLabel = tab === "high" ? "직전 최고 종가" : tab === "low" ? "직전 최저 종가" : "기간 최고 종가";

  function sortHeader(key: SortColumn, label: string, left = false) {
    return <SortHeader label={label} direction={column === key ? direction : undefined} left={left} onSort={() => {
      setSort({ column: key, direction: key === column && direction === "descending" ? "ascending" : "descending" });
      setPage(1);
    }} />;
  }

  return <section aria-label="신고가·신저가 레이더 분석">
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="분석 유형">
      {tabs.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => { setTab(item.id); setPage(1); }}
        className={`relative rounded-xl border bg-[#151a22] px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-emerald-400 ${tab === item.id ? "border-emerald-400/60 bg-emerald-400/[0.06]" : "border-white/10 hover:border-white/30"}`}>
        <span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-zinc-100">{item.label}</span><span className={`text-lg font-semibold tabular-nums ${item.tone}`}>{matches[item.id].length.toLocaleString("ko-KR")}<span className="ml-1 text-xs font-normal">종목</span></span></span>
        <span className="mt-1 block text-xs text-zinc-400">{item.detail}</span>
      </button>)}
    </div>

    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151a22]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-zinc-400">시장<select value={market} onChange={e => { setMarket(e.target.value as typeof market); setPage(1); }} className={inputStyle}>
            {Object.entries(marketLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="text-xs text-zinc-400">비교 기간<select value={period} onChange={e => { setPeriod(e.target.value as RadarPeriod); setPage(1); }} className={inputStyle}>
            {Object.entries(periodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {tab === "drawdown" && <label className="text-xs text-zinc-400">현재 낙폭<select value={threshold} onChange={e => { setThreshold(Number(e.target.value)); setPage(1); }} className={inputStyle}>
            {radarThresholds.map(value => <option key={value} value={value}>{value}% 이하</option>)}
          </select></label>}
          <label className="text-xs text-zinc-400">최소 거래대금(억원)<input type="number" min="0" step="any" value={turnover} onChange={e => { setTurnover(e.target.value); setPage(1); }} placeholder="전체" className={`${inputStyle} w-32`} /></label>
          <label className="text-xs text-zinc-400">최소 시가총액(억원)<input type="number" min="0" step="any" value={marketCap} onChange={e => { setMarketCap(e.target.value); setPage(1); }} placeholder="전체" className={`${inputStyle} w-32`} /></label>
          <label className="text-xs text-zinc-400">종목 검색<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="종목명 / 코드" className={`${inputStyle} w-40`} /></label>
        </div>
        <p className="mt-3 text-xs tabular-nums text-zinc-400" aria-live="polite">{periodLabels[period]} 분석 가능 {analyzable.toLocaleString("ko-KR")} / 보통주 {marketRows.length.toLocaleString("ko-KR")}종목</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-right text-sm tabular-nums">
          <caption className="sr-only">{active.label} 종목</caption>
          <thead className="bg-white/[0.035] text-xs text-zinc-400"><tr>
            {sortHeader("name", "종목", true)}
            {sortHeader("close", "종가(원)")}
            {sortHeader("reference", referenceLabel)}
            {sortHeader("signal", signalLabel)}
            {tab === "drawdown" && sortHeader("mdd", "최대낙폭(MDD)")}
            {sortHeader("marketCap", "시가총액(억원)")}
            {sortHeader("turnover", "거래대금(억원)")}
          </tr></thead>
          <tbody>
            {visible.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(candidate => {
              const { row, metrics, signal } = candidate;
              const reference = referencePoint(metrics, tab);
              return <tr key={row.code} className="border-t border-white/5 hover:bg-white/[0.035]">
                <th scope="row" className="px-4 py-3 text-left font-medium"><StockChartButton code={row.code} name={row.name} chart={{ tab, period, asOf, fetchedAt }} className="text-zinc-100" /><p className="mt-1 text-[11px] text-zinc-400">{row.code} · {marketLabels[row.market]}</p></th>
                <td className="px-4 py-3 text-zinc-200">{formatPrice(row.close)}</td>
                <td className="px-4 py-3 text-zinc-300">{formatPrice(reference.price)}<p className="mt-1 text-[11px] text-zinc-400">{reference.date}</p></td>
                <td className={`px-4 py-3 font-semibold ${active.tone}`}>{formatPct(signal)}</td>
                {tab === "drawdown" && <td className="px-4 py-3 text-sky-200">{formatPct(metrics.mddPct)}</td>}
                <td className="px-4 py-3 text-zinc-300">{formatEok(row.marketCap)}</td>
                <td className="px-4 py-3 text-zinc-300">{formatEok(row.turnover)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!visible.length && <p role="status" className="px-4 py-12 text-center text-sm text-zinc-400">현재 조건에 해당하는 종목이 없습니다.</p>}
      {pages > 1 && <div className="flex items-center justify-center gap-4 border-t border-white/10 p-4 text-xs text-zinc-400">
        <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-white/15 px-3 py-2 disabled:opacity-30">이전</button>
        <span>{currentPage} / {pages}</span>
        <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded border border-white/15 px-3 py-2 disabled:opacity-30">다음</button>
      </div>}
    </div>
    <p className="mt-4 max-w-4xl text-xs leading-relaxed text-zinc-400">1개월·3개월·52주는 기준일 직전의 KRX 15:30 종가가 있는 시장 거래일을 각각 21·63·252일 사용합니다. MDD는 기간 중 고점 이후 저점까지의 최대 낙폭입니다. 거래가 없던 기준일, 이력 부족, 가격 연속성을 확인할 수 없는 종목은 해당 기간 분석에서 제외합니다.</p>
  </section>;
}
