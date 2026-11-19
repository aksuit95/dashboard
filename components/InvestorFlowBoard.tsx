"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, createChart } from "lightweight-charts";
import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";
import { alignFlows, buyingStreak, cumulativeFlows, investorColors, investorNames, investors, rollingFlows, windowSum, type FlowPeriod, type Investor, type InvestorPoint } from "@/lib/market/investor-flow";
import type { InvestorBoard } from "@/lib/sources/investor-flow";
import type { TossFlowStock } from "@/lib/sources/toss-investor-flow";
import { PageHeader } from "./PageHeader";
import { MarketTurnoverChart } from "./MarketTurnoverChart";

const periods: FlowPeriod[] = [1, 5, 20, 60];
const box = "rounded-xl border border-white/10 bg-[#151a22] p-4 md:p-5";
const number = (value: number | null, digits = 1) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
const tone = (value: number | null) => value == null ? "text-zinc-500" : value > 0 ? "text-rose-400" : value < 0 ? "text-sky-400" : "text-zinc-400";
const kst = (date: string) => new Date(date).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
function Notice({ children }: { children: React.ReactNode }) {
  return <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm leading-relaxed text-amber-200">{children}</p>;
}
function Buttons({ period, setPeriod, active = true }: { period: FlowPeriod; setPeriod: (period: FlowPeriod) => void; active?: boolean }) {
  return <div className="flex gap-1" aria-label="조회 기간">{periods.map(p => <button key={p} type="button" aria-pressed={active && period === p} onClick={() => setPeriod(p)} className={`rounded-md px-3 py-2 text-xs ${active && period === p ? "bg-rose-950 text-rose-100" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>{p === 1 ? "일별" : `${p}일 누적`}</button>)}</div>;
}
function Summary({ points, divisor = 1e8, unit = "억 원" }: { points: InvestorPoint[]; divisor?: number; unit?: string }) {
  return <div className="grid gap-3 sm:grid-cols-3">{([5, 20, 60] as const).map(days => <div key={days} className={box}>
    <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">{days}거래일 누적</h3><span className="text-xs text-zinc-500">{unit}</span></div>
    <div className="space-y-2">{investors.map(key => { const value = windowSum(points, key, days); return <div key={key} className="flex justify-between text-sm"><span className="text-zinc-400">{investorNames[key]}</span><span className={`font-mono tabular-nums ${tone(value)}`}>{number(value == null ? null : value / divisor, divisor === 1 ? 0 : 1)}</span></div>; })}</div>
  </div>)}</div>;
}
function FlowChart({ points, prices = [], period, overlay, divisor = 1e8, unit, from, cumulative = false }: { points: InvestorPoint[]; prices?: { date: string; value: number }[]; period: FlowPeriod; overlay: boolean; divisor?: number; unit?: string; from?: string; cumulative?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ date: string; values: Record<Investor, number | null>; index: number | null } | null>(null);
  const plotted = useMemo(() => cumulative ? cumulativeFlows(points.filter(point => !from || point.date >= from)) : rollingFlows(points, period).filter(point => !from || point.date >= from), [points, period, from, cumulative]);
  const hasData = plotted.some(p => investors.some(key => p[key] != null)) || (overlay && prices.length > 0);
  useEffect(() => {
    if (!host.current || !hasData) return;
    const element = host.current;
    const chart = createChart(element, { width: element.clientWidth, height: 330,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#ffffff05" }, horzLines: { color: "#ffffff0b" } },
      rightPriceScale: { borderColor: "#ffffff15" }, leftPriceScale: { visible: overlay, borderColor: "#ffffff15" },
      timeScale: { borderColor: "#ffffff15" }, localization: { locale: "ko-KR" },
    });
    const flowSeries = Object.fromEntries(investors.map(key => {
      const series = chart.addLineSeries({ color: investorColors[key], lineWidth: 2, priceScaleId: "right", lastValueVisible: false, priceLineVisible: false, priceFormat: { type: "custom", formatter: (v: number) => number(v, divisor === 1 ? 0 : 1) } });
      series.setData(plotted.map(p => p[key] == null ? { time: p.date } : { time: p.date, value: p[key]! / divisor }));
      const value = plotted.at(-1)?.[key];
      const line = series.createPriceLine({ price: value == null ? 0 : value / divisor, color: investorColors[key], lineWidth: 1, axisLabelVisible: value != null, lineVisible: value != null, title: investorNames[key] });
      return [key, { series, line }];
    })) as Record<Investor, { series: ReturnType<typeof chart.addLineSeries>; line: ReturnType<ReturnType<typeof chart.addLineSeries>["createPriceLine"]> }>;
    let indexSeries: ReturnType<typeof chart.addLineSeries> | null = null;
    let indexLine: ReturnType<ReturnType<typeof chart.addLineSeries>["createPriceLine"]> | null = null;
    if (overlay && prices.length) {
      const series = chart.addLineSeries({ color: "#e4e4e7", lineWidth: 2, priceScaleId: "left", lastValueVisible: false, priceLineVisible: false });
      series.setData(prices.map(p => ({ time: p.date, value: p.value })));
      indexSeries = series;
      indexLine = series.createPriceLine({ price: prices.at(-1)!.value, color: "#e4e4e7", lineWidth: 1, axisLabelVisible: true, title: "지수" });
    }
    chart.subscribeCrosshairMove(param => {
      const hasPoint = param.point != null && param.time != null && param.point.x >= 0 && param.point.x <= element.clientWidth;
      const valueFor = (series: ReturnType<typeof chart.addLineSeries>) => {
        const entry = param.seriesData.get(series);
        return entry && "value" in entry && typeof entry.value === "number" ? entry.value : null;
      };
      const values = Object.fromEntries(investors.map(key => {
        const value = hasPoint ? valueFor(flowSeries[key].series) : (plotted.at(-1)?.[key] == null ? null : plotted.at(-1)![key]! / divisor);
        flowSeries[key].line.applyOptions({ ...(value == null ? {} : { price: value }), axisLabelVisible: value != null, lineVisible: value != null });
        return [key, value];
      })) as Record<Investor, number | null>;
      const index = indexSeries && hasPoint ? valueFor(indexSeries) : prices.at(-1)?.value ?? null;
      indexLine?.applyOptions({ ...(index == null ? {} : { price: index }), axisLabelVisible: index != null, lineVisible: index != null });
      if (hasPoint) {
        const time = param.time;
        const date = typeof time === "string" ? time : typeof time === "object" && time != null ? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}` : "";
        setHover({ date, values, index });
      } else setHover(null);
    });
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth }));
    observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [plotted, prices, overlay, divisor, hasData]);
  return <>{hasData && <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400" aria-live="polite"><span>{hover?.date || "최근 거래일"}</span>{investors.map(key => <span key={key} style={{ color: investorColors[key] }}>{investorNames[key]} {number(hover ? hover.values[key] : (plotted.at(-1)?.[key] == null ? null : plotted.at(-1)![key]! / divisor), divisor === 1 ? 0 : 1)}</span>)}{overlay && <span>지수 {(hover ? hover.index : prices.at(-1)?.value)?.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</span>}</div>}{hasData ? <div ref={host} className="w-full" aria-label="투자자별 수급 추이 차트" /> : <div className="flex h-60 items-center justify-center text-sm text-zinc-500">이 구간의 확정 수급 데이터가 없습니다.</div>}<div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">{investors.map(key => <span key={key}><span style={{ color: investorColors[key] }}>●</span> {investorNames[key]}</span>)}{overlay && <span>● 지수 (왼쪽 축 · pt)</span>}<span className="ml-auto">수급 오른쪽 축 · {unit ?? (divisor === 1 ? "계약" : "억 원")}</span></div></>;
}
function DailyTable({ points, divisor = 1e8, unit }: { points: InvestorPoint[]; divisor?: number; unit?: string }) {
  return <details className="mt-4 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm text-zinc-400">일별 순매수 원자료 ({points.length}거래일)</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-right text-xs"><thead className="sticky top-0 bg-[#151a22] text-zinc-500"><tr><th className="p-2 text-left">거래일</th>{investors.map(k => <th key={k} className="p-2">{investorNames[k]} ({unit ?? (divisor === 1 ? "계약" : "억 원")})</th>)}</tr></thead><tbody>{[...points].reverse().map(p => <tr key={p.date} className="border-t border-white/5"><td className="p-2 text-left text-zinc-400">{p.date}</td>{investors.map(k => <td key={k} className={`p-2 font-mono ${tone(p[k])}`}>{number(p[k] == null ? null : p[k]! / divisor, divisor === 1 ? 0 : 1)}</td>)}</tr>)}</tbody></table></div></details>;
}
function TossMarketFlow({ board, universe }: { board: InvestorBoard; universe: MinerviniUniverse }) {
  const [data, setData] = useState<{ market: "KOSPI" | "KOSDAQ"; points: InvestorPoint[]; prices: { date: string; value: number }[]; priceError: string | null; turnover?: { date: string; value: number }[]; turnoverError?: string | null; turnoverCollectedAt?: string | null; latestUpdatedAt: string | null; collectedAt: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null), [period, setPeriod] = useState<FlowPeriod>(1);
  const [months, setMonths] = useState<3 | 6 | 12>(12);
  const [cumulative, setCumulative] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setFailure(null);
    fetch(`/api/investor-flow/toss?universe=${universe}&view=index&asOf=${board.asOf}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "시장 수급 조회 실패"); setData(body);
    }).catch(error => { if (!controller.signal.aborted) setFailure(error.message); });
    return () => controller.abort();
  }, [universe, board.asOf]);
  const points = useMemo(() => {
    if (!data?.points.length) return [];
    const earliest = data.points[0].date;
    const dates = [...new Set([...data.points.map(p => p.date), ...(board.equity?.sessions ?? []).filter(date => date >= earliest && date <= board.asOf)])].sort();
    return alignFlows(data.points, dates);
  }, [data, board.equity?.sessions, board.asOf]);
  const from = useMemo(() => { const date = new Date(`${board.asOf}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - months); return date.toISOString().slice(0, 10); }, [board.asOf, months]);
  const chartPrices = useMemo(() => (data?.prices ?? []).filter(point => point.date >= from), [data, from]);
  const latest = data?.points.at(-1)?.date;
  return <><section className={`${box} space-y-4`}><h2 className="font-semibold">{universe === "kospi200" ? "코스피" : "코스닥"} 시장 전체 · 투자자별 순매수 대금</h2>
    <p className="text-xs leading-relaxed text-zinc-400">토스증권 KRX 시장 전체 · 매수대금 − 매도대금 · 억 원 · 외국인에는 등록·미등록 외국인이 포함됩니다. 비교 차트는 {universe === "kospi200" ? "코스피" : "코스닥"} KRX 정규장 종가입니다. 2026-11-19은 16:30 종가입니다.</p>
    {failure && <Notice>{failure}</Notice>}
    {!failure && !data && <p className="text-sm text-zinc-400">저장된 시장 수급을 불러오고 있습니다…</p>}
    {data && <><p className="text-xs text-zinc-500">수급 기준일 {latest ?? "없음"} · 원본 갱신 {data.latestUpdatedAt ? `${kst(data.latestUpdatedAt)} KST` : "미제공"} · 수집 {kst(data.collectedAt)} KST</p>
      {latest !== board.asOf && <Notice>{board.asOf} 시장 수급이 아직 제공되지 않아 해당 거래일은 결측으로 표시합니다.</Notice>}
      {data.priceError && <Notice>일부 비교 지수 이력을 불러오지 못했습니다: {data.priceError}. 수급 이력은 그대로 표시합니다.</Notice>}
      <div className="flex flex-wrap gap-1"><button type="button" aria-pressed={cumulative} onClick={() => setCumulative(true)} className={`rounded-md px-3 py-2 text-xs ${cumulative ? "bg-rose-950 text-rose-100" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>구간 누적</button><Buttons period={period} active={!cumulative} setPeriod={value => { setCumulative(false); setPeriod(value); }} /></div><Summary points={points} />
      <div className="flex items-center gap-1" aria-label="차트 조회 구간">{([3, 6, 12] as const).map(n => <button key={n} type="button" onClick={() => setMonths(n)} aria-pressed={months === n} className={`rounded px-3 py-2 text-xs ${months === n ? "bg-white/15 text-white" : "text-zinc-500"}`}>{n === 12 ? "1년" : `${n}개월`}</button>)}</div>
      {cumulative && <p className="text-xs text-zinc-500">선택한 차트 구간의 첫 거래일부터 순매수 대금을 누적합니다. 거래일 자료가 빠지면 그 이후 누적은 결측으로 표시합니다.</p>}
      <FlowChart points={points} prices={chartPrices} period={period} overlay from={from} cumulative={cumulative} /><DailyTable points={points} />
    </>}
  </section>{data && <MarketTurnoverChart market={universe === "kospi200" ? "코스피" : "코스닥"} points={data.turnover} error={data.turnoverError} asOf={board.asOf} collectedAt={data.turnoverCollectedAt} />}</>;
}
const stockWindows = [5, 20, 60] as const;
const wonPerEok = 100_000_000;
const capFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const stockSortDefault = { key: "marketCap", ascending: false } as const;
type StockSortKey = "name" | "marketCap" | "amount" | typeof stockWindows[number] | "streakDays";
const stockColumns: [StockSortKey, string][] = [
  ["name", "종목"], ["marketCap", "시가총액 (억 원)"], ["amount", "선택 기간 (주)"],
  ...stockWindows.map<[StockSortKey, string]>(days => [days, `${days}일 (주)`]), ["streakDays", "연속 순매수"],
];
const flowDirections = { all: "전체", buy: "순매수", sell: "순매도", flat: "보합 (0주)", missing: "결측" } as const;
type FlowDirection = keyof typeof flowDirections;
const stockFilterField = "mt-1 block w-full rounded-md border border-white/10 bg-[#10141b] px-3 py-2 text-sm text-zinc-100";

function TossFlow({ board, universe }: { board: InvestorBoard; universe: MinerviniUniverse }) {
  const [data, setData] = useState<{ rows: TossFlowStock[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null), [period, setPeriod] = useState<FlowPeriod>(1), [investor, setInvestor] = useState<Investor>("foreign");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: StockSortKey; ascending: boolean }>(stockSortDefault);
  const [direction, setDirection] = useState<FlowDirection>("all");
  const [minCap, setMinCap] = useState("");
  const [maxCap, setMaxCap] = useState("");
  const [minStreak, setMinStreak] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setFailure(null);
    fetch(`/api/investor-flow/toss?universe=${universe}&view=stocks&asOf=${board.asOf}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "종목 수급 조회 실패");
      if (!controller.signal.aborted) setData(body);
    }).catch(error => { if (!controller.signal.aborted) setFailure(error.message); });
    return () => controller.abort();
  }, [universe, board.asOf]);

  const full = board.stockScope === "INDEX_CONSTITUENTS_AS_OF";
  const rows = useMemo(() => {
    const stocks = board.equity?.stocks ?? [];
    const marketCaps = new Map(stocks.map(stock => [stock.code, stock.marketCap]));
    const flows = data?.rows ?? [];
    const byCode = new Map(flows.map(row => [row.code, row]));
    const members = full ? stocks.map(({ code, name }) => byCode.get(code) ?? {
      code, name, points: [], error: failure ?? "저장된 수급 자료 없음",
    }) : flows;
    return members.map(row => {
      const cap = marketCaps.get(row.code);
      return { ...row, marketCap: board.priceBasis === "KRX_REGULAR_CLOSE" && cap != null && Number.isFinite(cap) && cap > 0 ? cap : null,
        points: alignFlows(row.points, board.equity?.sessions ?? []) };
    });
  }, [full, board.equity, board.priceBasis, data, failure]);
  const metrics = useMemo(() => rows.map(({ points, ...row }) => {
    const streak = buyingStreak(points, investor);
    const totals = { 5: windowSum(points, investor, 5), 20: windowSum(points, investor, 20), 60: windowSum(points, investor, 60) };
    return { ...row, ...totals, amount: period === 1 ? windowSum(points, investor, 1) : totals[period],
      streakDays: streak?.days ?? null, streakAtLeast: streak?.atLeast ?? false };
  }), [rows, investor, period]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const minimum = minCap ? Number(minCap) * wonPerEok : 0;
    const maximum = maxCap ? Number(maxCap) * wonPerEok : Infinity;
    const days = Number(minStreak);
    return metrics.filter(row => {
      if (search && !row.name.toLowerCase().includes(search) && !row.code.toLowerCase().includes(search)) return false;
      if ((minCap || maxCap) && (row.marketCap == null || row.marketCap < minimum || row.marketCap > maximum)) return false;
      if (days > 0 && (row.streakDays == null || row.streakDays < days)) return false;
      if (direction === "all") return true;
      if (direction === "missing") return row.amount == null;
      if (row.amount == null) return false;
      return direction === "buy" ? row.amount > 0 : direction === "sell" ? row.amount < 0 : row.amount === 0;
    }).sort((a, b) => {
      const { key, ascending } = sort;
      if (key === "name") return (ascending ? a.name.localeCompare(b.name, "ko") : b.name.localeCompare(a.name, "ko")) || a.code.localeCompare(b.code);
      const x = a[key], y = b[key];
      const compare = x == null || y == null ? Number(x == null) - Number(y == null) : ascending ? x - y : y - x;
      return compare || (b.marketCap ?? 0) - (a.marketCap ?? 0) || a.code.localeCompare(b.code);
    });
  }, [metrics, query, minCap, maxCap, minStreak, direction, sort]);

  function resetFilters() {
    setQuery(""); setDirection("all"); setMinCap(""); setMaxCap(""); setMinStreak("");
    setInvestor("foreign"); setPeriod(1); setSort(stockSortDefault);
  }
  return <section className={`${box} space-y-4`}>
    <h2 className="font-semibold">{minerviniUniverses[universe].name} 투자자별 순매수</h2>
    <p className="text-xs leading-relaxed text-zinc-400">토스증권 · KRX·NXT 합산 · 단위 주 · 외국인은 등록외국인 기준입니다.</p>
    {failure && <Notice>{failure}</Notice>}
    {!failure && !data && <p className="text-sm text-zinc-400">저장된 토스 수급을 불러오고 있습니다…</p>}
    {(data || failure) && rows.length > 0 && <>
      <p className="text-xs text-zinc-500">{board.asOf} 기준 · {full ? `지수 구성종목 ${rows.length}개` : `이전 수집 범위 · 시장 시가총액 상위 ${rows.length}개`} · 수급 {rows.filter(row => !row.error).length}개 수신</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2" role="group" aria-label="투자자 유형">{investors.map(key => <button key={key} type="button" onClick={() => setInvestor(key)} aria-pressed={investor === key} className={`rounded px-3 py-2 text-xs ${investor === key ? "bg-white/15 text-white" : "text-zinc-500"}`}>{investorNames[key]}</button>)}</div>
        <Buttons period={period} setPeriod={setPeriod} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-44 text-xs text-zinc-400">종목 검색
          <input type="search" placeholder="종목명 또는 종목코드" value={query} onChange={event => setQuery(event.target.value)} className={stockFilterField} />
        </label>
        <label className="w-32 text-xs text-zinc-400">선택 기간 수급
          <select value={direction} onChange={event => setDirection(event.target.value as FlowDirection)} className={stockFilterField}>
            {Object.entries(flowDirections).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="w-32 text-xs text-zinc-400">시총 최소 (억 원)
          <input type="number" min="0" step="1" placeholder="제한 없음" value={minCap} onChange={event => setMinCap(event.target.value)} className={stockFilterField} />
        </label>
        <label className="w-32 text-xs text-zinc-400">시총 최대 (억 원)
          <input type="number" min="0" step="1" placeholder="제한 없음" value={maxCap} onChange={event => setMaxCap(event.target.value)} className={stockFilterField} />
        </label>
        <label className="w-32 text-xs text-zinc-400">연속 순매수 (일 이상)
          <input type="number" min="0" step="1" placeholder="제한 없음" value={minStreak} onChange={event => setMinStreak(event.target.value)} className={stockFilterField} />
        </label>
        <button type="button" onClick={resetFilters} className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">필터 초기화</button>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-400">
        <span role="status">{filtered.length} / {rows.length}종목 표시</span>
        <span>시가총액 {board.asOf} KRX {board.asOf === "2026-11-19" ? "16:30" : "15:30"} 기준 · 열 제목을 눌러 정렬</span>
      </div>
      {filtered.length ? <div className="max-h-[70vh] overflow-auto" tabIndex={0} role="region" aria-label="구성종목 수급 표">
        <table className="w-full whitespace-nowrap text-right text-sm tabular-nums">
          <thead className="sticky top-0 bg-[#151a22] text-xs text-zinc-400"><tr>{stockColumns.map(([key, label]) => {
            const active = sort.key === key;
            return <th key={key} scope="col" aria-sort={active ? (sort.ascending ? "ascending" : "descending") : undefined} className={key === "name" ? "text-left" : undefined}>
              <button type="button" onClick={() => setSort(current => ({ key, ascending: current.key === key ? !current.ascending : key === "name" }))}
                className={`rounded px-2 py-2 hover:text-white ${active ? "text-zinc-100" : ""}`}>{label} <span aria-hidden="true">{active ? (sort.ascending ? "↑" : "↓") : "↕"}</span></button>
            </th>;
          })}</tr></thead>
          <tbody>{filtered.map(row => <tr key={row.code} className="border-t border-white/5">
            <td className="p-2 text-left">{row.name} <span className="text-xs text-zinc-500">{row.code}</span>{row.error && <span className="ml-2 text-xs text-amber-300" title={row.error}>결측</span>}</td>
            <td className="px-2 text-zinc-200">{row.marketCap == null ? "—" : capFormat.format(row.marketCap / wonPerEok)}</td>
            <td className={`px-2 ${tone(row.amount)}`}>{number(row.amount, 0)}</td>
            {stockWindows.map(days => <td key={days} className={`px-2 ${tone(row[days])}`}>{number(row[days], 0)}</td>)}
            <td className="px-2">{row.streakDays == null ? "—" : `${row.streakDays}일${row.streakAtLeast ? "+" : ""}`}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="text-sm text-zinc-400" role="status">{minCap && maxCap && Number(minCap) > Number(maxCap) ? "시총 최대값을 최소값 이상으로 입력해 주세요." : "조건에 맞는 종목이 없습니다."}</p>}
    </>}
  </section>;
}
export function InvestorFlowBoard({ universe, view }: { universe: MinerviniUniverse; view: "index" | "stocks" }) {
  const [board, setBoard] = useState<InvestorBoard | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [refresh, setRefresh] = useState(0);
  const spec = minerviniUniverses[universe];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setBoard(null);
    fetch(`/api/investor-flow?universe=${universe}&view=${view}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "수급 조회 실패");
      setBoard(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [universe, view, refresh]);
  return <div className="space-y-5">
    <PageHeader title={view === "index" ? `${spec.market === "KOSPI" ? "코스피" : "코스닥"} 시장 수급` : `${spec.name} 종목 수급`} description={view === "index" ? `시장 전체의 투자자별 순매수 대금과 ${spec.market === "KOSPI" ? "코스피" : "코스닥"} 지수를 비교합니다.` : `${spec.name} 구성종목 전체의 투자자별 순매수 수량을 확인합니다.`} />
    <div className="flex flex-wrap gap-2">{(["kospi200", "kosdaq150"] as const).flatMap(u => (["index", "stocks"] as const).map(v => <Link key={`${u}-${v}`} href={`/investor-flow/${u}${v === "stocks" ? "/stocks" : ""}`} aria-current={u === universe && v === view ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-xs ${u === universe && v === view ? "border-rose-500/40 bg-rose-950 text-rose-100" : "border-white/10 text-zinc-400 hover:bg-white/5"}`}>{v === "index" ? `${u === "kospi200" ? "코스피" : "코스닥"} 시장` : `${minerviniUniverses[u].name} 종목`}</Link>))}<Link href="/investor-flow/pension" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5">국민연금 공시</Link></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 px-4 py-3 text-xs text-zinc-400">
      <div className="space-y-1"><p>현물 기준 {board?.asOf ?? "확인 중"} · KRX 정규장 {board?.asOf === "2026-11-19" ? "16:30" : "15:30"} KST</p><p>시세 출처 {board?.quoteSource === "KRX_WEB" ? "KRX 정보데이터시스템 · 네이버 종가 대조" : board?.quoteSource === "KRX_OPEN_API" ? "KRX Open API" : "확인 중"} · 거래일 16:00 KST 수집 · 최근 수집 {board ? kst(board.fetchedAt) : "—"} KST</p></div>
      <button type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)} className="rounded-md bg-white/10 px-3 py-2 text-zinc-200 disabled:opacity-40">{loading ? "조회 중…" : "저장 자료 새로고침"}</button>
    </div>
    {loading && <div className={`${box} animate-pulse text-sm text-zinc-400`} role="status">{view === "index" ? "기준일 지수 종가를 불러오고 있습니다." : "저장된 구성종목 목록을 불러오고 있습니다."}</div>}
    {error && <Notice>{error}</Notice>}
    {board?.stale && <Notice>새 기준일 자료가 없어 마지막 저장 결과를 표시합니다. 기준일을 확인해 주세요.</Notice>}
    {board?.collectionError && <Notice>예약 수집 안내: {board.collectionError} · 다음 거래일 16:00에 다시 수집합니다.</Notice>}
    {board?.equityError && <Notice>현물 데이터 수신 불가: {board.equityError}</Notice>}
    {board && (view === "index" ? <TossMarketFlow key={refresh} board={board} universe={universe} /> : <TossFlow key={refresh} board={board} universe={universe} />)}
    <p className="text-xs leading-relaxed text-zinc-500">5·20·60일은 거래일 기준입니다. 결측값은 —로 표시합니다. 수급 출처: 토스증권 · 종가·시총 출처: <a href="https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd" target="_blank" rel="noreferrer" className="underline">KRX 정보데이터시스템</a>.</p>
  </div>;
}
