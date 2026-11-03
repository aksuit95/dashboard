"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, createChart } from "lightweight-charts";
import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";
import { alignFlows, buyingStreak, cumulativeFlows, investorColors, investorNames, investors, rollingFlows, windowSum, type FlowPeriod, type Investor, type InvestorPoint } from "@/lib/market/investor-flow";
import type { InvestorBoard } from "@/lib/sources/investor-flow";
import { PageHeader } from "./PageHeader";

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
  const [data, setData] = useState<{ market: "KOSPI" | "KOSDAQ"; points: InvestorPoint[]; prices: { date: string; value: number }[]; priceError: string | null; latestUpdatedAt: string | null; collectedAt: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null), [period, setPeriod] = useState<FlowPeriod>(1);
  const [months, setMonths] = useState<3 | 6 | 12>(12);
  const [cumulative, setCumulative] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setFailure(null);
    fetch(`/api/investor-flow/toss?universe=${universe}&view=index`, { signal: controller.signal, cache: "no-store" }).then(async response => {
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
  return <section className={`${box} space-y-4`}><h2 className="font-semibold">{universe === "kospi200" ? "코스피" : "코스닥"} 시장 전체 · 투자자별 순매수 대금</h2>
    <p className="text-xs leading-relaxed text-zinc-400">토스증권 KRX 시장 전체 · 매수대금 − 매도대금 · 억 원 · 외국인에는 등록·미등록 외국인이 포함됩니다. 비교 차트는 {universe === "kospi200" ? "코스피" : "코스닥"} KRX 15:30 종가입니다.</p>
    {failure && <Notice>{failure}</Notice>}
    {!failure && !data && <p className="text-sm text-zinc-400">시장 수급을 수집하고 있습니다…</p>}
    {data && <><p className="text-xs text-zinc-500">수급 기준일 {latest ?? "없음"} · 원본 갱신 {data.latestUpdatedAt ? `${kst(data.latestUpdatedAt)} KST` : "미제공"} · 조회 {kst(data.collectedAt)} KST</p>
      {latest !== board.asOf && <Notice>{board.asOf} 시장 수급이 아직 제공되지 않아 해당 거래일은 결측으로 표시합니다.</Notice>}
      {data.priceError && <Notice>일부 비교 지수 이력을 불러오지 못했습니다: {data.priceError}. 수급 이력은 그대로 표시합니다.</Notice>}
      <div className="flex flex-wrap gap-1"><button type="button" aria-pressed={cumulative} onClick={() => setCumulative(true)} className={`rounded-md px-3 py-2 text-xs ${cumulative ? "bg-rose-950 text-rose-100" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>구간 누적</button><Buttons period={period} active={!cumulative} setPeriod={value => { setCumulative(false); setPeriod(value); }} /></div><Summary points={points} />
      <div className="flex items-center gap-1" aria-label="차트 조회 구간">{([3, 6, 12] as const).map(n => <button key={n} type="button" onClick={() => setMonths(n)} aria-pressed={months === n} className={`rounded px-3 py-2 text-xs ${months === n ? "bg-white/15 text-white" : "text-zinc-500"}`}>{n === 12 ? "1년" : `${n}개월`}</button>)}</div>
      {cumulative && <p className="text-xs text-zinc-500">선택한 차트 구간의 첫 거래일부터 순매수 대금을 누적합니다. 거래일 자료가 빠지면 그 이후 누적은 결측으로 표시합니다.</p>}
      <FlowChart points={points} prices={chartPrices} period={period} overlay from={from} cumulative={cumulative} /><DailyTable points={points} />
    </>}
  </section>;
}
function TossFlow({ board, universe, view }: { board: InvestorBoard; universe: MinerviniUniverse; view: "index" | "stocks" }) {
  const [data, setData] = useState<{ rows: { code: string; name: string; points: InvestorPoint[]; error: string | null }[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null), [period, setPeriod] = useState<FlowPeriod>(1), [investor, setInvestor] = useState<Investor>("foreign");
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setFailure(null);
    fetch(`/api/investor-flow/toss?universe=${universe}&view=${view}`, { signal: controller.signal, cache: "no-store" }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); setData(body); }).catch(e => { if (!controller.signal.aborted) setFailure(e.message); });
    return () => controller.abort();
  }, [universe, view, board.asOf]);
  const sessions = board.equity?.sessions ?? [];
  const rows = (data?.rows ?? []).map(row => ({ ...row, points: alignFlows(row.points, sessions) }));
  return <section className={`${box} space-y-4`}><h2 className="font-semibold">토스증권 투자자별 순매수</h2>
    <p className="text-xs leading-relaxed text-zinc-400">KRX·NXT 합산 · 단위: 주 · 외국인은 등록외국인 기준. 거래대금은 제공되지 않습니다. {view === "index" && "현재 구성종목을 고정해 과거를 합산하며 편입·편출을 소급하지 않습니다."}</p>
    {failure && <Notice>{failure}</Notice>}
    {!failure && !data && <p className="text-sm text-zinc-400">토스 수급을 수집하고 있습니다…</p>}
    {data && <><p className="text-xs text-zinc-500">{board.asOf} 기준 · {data.rows.filter(r => !r.error).length}/{data.rows.length}개 수신 · 누락된 날의 합산은 결측입니다.</p>
      <Buttons period={period} setPeriod={setPeriod} />
      <>
        <div className="flex gap-2">{investors.map(k => <button key={k} type="button" onClick={() => setInvestor(k)} aria-pressed={investor === k} className={`rounded px-3 py-2 text-xs ${investor === k ? "bg-white/15" : "text-zinc-500"}`}>{investorNames[k]}</button>)}</div>
        <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-sm"><thead className="text-xs text-zinc-500"><tr><th className="p-2 text-left">종목</th><th>선택 기간 (주)</th><th>5일 (주)</th><th>20일 (주)</th><th>60일 (주)</th><th>연속 순매수</th></tr></thead><tbody>{rows.map(r => ({ ...r, amount: windowSum(r.points, investor, period), streak: buyingStreak(r.points, investor) })).sort((a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity)).map(r => <tr key={r.code} className="border-t border-white/5"><td className="p-2 text-left">{r.name} <span className="text-xs text-zinc-500">{r.code}</span>{r.error && <span className="ml-2 text-amber-300 text-xs" title={r.error}>결측</span>}</td><td className={tone(r.amount)}>{number(r.amount, 0)}</td>{([5, 20, 60] as const).map(n => <td key={n} className={tone(windowSum(r.points, investor, n))}>{number(windowSum(r.points, investor, n), 0)}</td>)}<td>{r.streak ? `${r.streak.days}일${r.streak.atLeast ? "+" : ""}` : "—"}</td></tr>)}</tbody></table></div>
      </></>}
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
  const equity = board?.equity;
  return <div className="space-y-5">
    <PageHeader title={view === "index" ? `${spec.market === "KOSPI" ? "코스피" : "코스닥"} 시장 수급` : `${spec.name} 종목 수급`} description={view === "index" ? `시장 전체의 투자자별 순매수 대금과 ${spec.market === "KOSPI" ? "코스피" : "코스닥"} 지수를 비교합니다.` : `${spec.market === "KOSPI" ? "코스피" : "코스닥"} 시장 시가총액 상위 10개 종목으로 먼저 테스트합니다.`} />
    <div className="flex flex-wrap gap-2">{(["kospi200", "kosdaq150"] as const).flatMap(u => (["index", "stocks"] as const).map(v => <Link key={`${u}-${v}`} href={`/investor-flow/${u}${v === "stocks" ? "/stocks" : ""}`} aria-current={u === universe && v === view ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-xs ${u === universe && v === view ? "border-rose-500/40 bg-rose-950 text-rose-100" : "border-white/10 text-zinc-400 hover:bg-white/5"}`}>{v === "index" ? `${u === "kospi200" ? "코스피" : "코스닥"} 시장` : `${minerviniUniverses[u].name} 종목`}</Link>))}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 px-4 py-3 text-xs text-zinc-400">
      <div className="space-y-1"><p>현물 기준 {board?.asOf ?? "확인 중"} · KRX 정규장 15:30 KST</p><p>수집 {board ? kst(board.fetchedAt) : "—"} KST</p></div>
      <button type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)} className="rounded-md bg-white/10 px-3 py-2 text-zinc-200 disabled:opacity-40">{loading ? "수집 중…" : "새로고침"}</button>
    </div>
    {loading && <div className={`${box} animate-pulse text-sm text-zinc-400`} role="status">{view === "index" ? "기준일 지수 종가를 불러오고 있습니다." : "시총 상위 10개 종목의 자료를 불러오고 있습니다."}</div>}
    {error && <Notice>{error}</Notice>}
    {board?.equityError && <Notice>현물 데이터 수신 불가: {board.equityError}</Notice>}
    {board && (view === "index" ? <TossMarketFlow board={board} universe={universe} /> : <TossFlow board={board} universe={universe} view={view} />)}
    {equity && view === "stocks" && <>
      <div className={`${box} flex flex-wrap items-center justify-between gap-3`}><div><p className="text-xs text-zinc-500">{spec.name} · KRX 15:30 종가</p><p className="mt-1 font-mono text-2xl font-semibold">{equity.prices.at(-1)?.value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}<span className="ml-2 text-xs font-normal text-zinc-500">pt</span></p></div><p className="text-xs text-zinc-400">{board?.asOf} 기준 · {equity.prices.length}거래일 시세 수신</p></div>
      {view === "stocks" && <section className={box}><h2 className="mb-4 font-semibold">시총 상위 10개 · KRX 종가</h2><div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="text-xs text-zinc-500"><tr><th className="p-2 text-left">종목</th><th className="p-2">KRX 종가 (원)</th><th className="p-2">시총 (조 원)</th></tr></thead><tbody>{equity.stocks.map(stock => <tr key={stock.code} className="border-t border-white/5"><td className="p-2 text-left">{stock.name} <span className="text-xs text-zinc-500">{stock.code}</span></td><td className="p-2">{stock.price?.toLocaleString("ko-KR") ?? "—"}</td><td className="p-2">{(stock.marketCap / 1e12).toFixed(2)}</td></tr>)}</tbody></table></div></section>}
    </>}
    <p className="text-xs leading-relaxed text-zinc-500">5·20·60일은 거래일 기준입니다. 결측값은 —로 표시합니다. 수급 출처: 토스증권 · 종가·시총 출처: <a href="https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd" target="_blank" rel="noreferrer" className="underline">KRX 정보데이터시스템</a>.</p>
  </div>;
}
