"use client";

import { createChart, ColorType, type Time } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { indexTurnoverProfile, type IndexDay, type IndexMarket, type Point } from "@/lib/market/market-liquidity";

export type LiquiditySeries = { id: string; name: string; unit: string; points: Point[] };
type Comparison = Record<IndexMarket, Point[]>;

const display = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const markets = { KOSPI: "코스피", KOSDAQ: "코스닥" };
const periods = [21, 63, 126, 252];
const button = "rounded-md px-3 py-1.5 text-xs transition focus-visible:outline-2 focus-visible:outline-emerald-400";
const selected = (active: boolean) => active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-zinc-400 hover:text-white";

export function LiquidityChart({ series, comparison }: { series: LiquiditySeries[]; comparison?: Comparison }) {
  const host = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState(series[0]?.id);
  const [period, setPeriod] = useState<number | null>(63);
  const [market, setMarket] = useState<IndexMarket | "">("");
  const [hover, setHover] = useState<string | null>(null);
  const item = series.find(row => row.id === metric) ?? series[0];
  const points = useMemo(() => item?.points.slice(period == null ? 0 : -period) ?? [], [item, period]);
  const reference = useMemo(() => {
    if (!market || !comparison) return [];
    const dates = new Set(points.map(point => point.date));
    return comparison[market].filter(point => dates.has(point.date));
  }, [comparison, market, points]);
  const current = points.find(point => point.date === hover) ?? points.at(-1);
  const index = reference.find(point => point.date === current?.date);

  useEffect(() => {
    const element = host.current;
    if (!element || !points.length) return;
    const chart = createChart(element, {
      width: element.clientWidth, height: 280,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#252b34" }, horzLines: { color: "#252b34" } },
      leftPriceScale: { visible: reference.length > 0, borderColor: "#333b46" },
      rightPriceScale: { borderColor: "#333b46" },
      timeScale: { borderColor: "#333b46" },
    });
    const line = chart.addLineSeries({ color: "#34d399", lineWidth: 2, priceLineVisible: false });
    line.setData(points.map(point => ({ time: point.date, value: point.value })));
    if (reference.length) {
      const indexByDate = new Map(reference.map(point => [point.date, point.value]));
      const overlay = chart.addLineSeries({ color: "#60a5fa", priceScaleId: "left", lineWidth: 2, priceLineVisible: false });
      overlay.setData(points.map(point => {
        const value = indexByDate.get(point.date);
        return value == null ? { time: point.date } : { time: point.date, value };
      }));
    }
    chart.timeScale().fitContent();
    function onMove(event: { time?: Time }) { setHover(typeof event.time === "string" ? event.time : null); }
    chart.subscribeCrosshairMove(onMove);
    const observer = new ResizeObserver(() => chart.resize(element.clientWidth, 280));
    observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [points, reference]);

  if (!item) return null;
  return <div className="mt-5 rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm text-zinc-400">지표
        <select className="rounded-md border border-white/10 bg-[#10151c] px-2 py-1.5 text-zinc-100" value={item.id} onChange={event => { setMetric(event.target.value); setHover(null); }}>
          {series.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      {item.points.length > periods[0] ? <div className="flex flex-wrap gap-1" aria-label="차트 거래일 수">
        {periods.filter(days => days < item.points.length).map(days => <button key={days} type="button" aria-pressed={period === days} className={`${button} ${selected(period === days)}`} onClick={() => { setPeriod(days); setHover(null); }}>{days}일</button>)}
        <button type="button" aria-pressed={points.length === item.points.length} className={`${button} ${selected(points.length === item.points.length)}`} onClick={() => { setPeriod(null); setHover(null); }}>전체</button>
      </div> : null}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
      <span>{current ? <>{current.date} · <span className="text-emerald-300">{display(current.value)} {item.unit}</span>{market && index ? <span className="ml-3 text-blue-300">{markets[market]} {display(index.value)} pt</span> : null}</> : "표시할 관측값이 없습니다."}</span>
      {comparison ? <label className="flex items-center gap-2">KRX 15:30 종가 비교
        <select className="rounded border border-white/10 bg-[#10151c] px-2 py-1" value={market} onChange={event => setMarket(event.target.value as IndexMarket | "")}>
          <option value="">끄기</option><option value="KOSPI">코스피</option><option value="KOSDAQ">코스닥</option>
        </select>
      </label> : null}
    </div>
    {points.length ? <div className="mt-3 w-full" ref={host} role="img" aria-label={`${item.name} 일별 추이`} /> : null}
    {market && !reference.length ? <p className="mt-2 text-xs text-zinc-400">이 기간에 기준일이 일치하는 KRX 15:30 종가가 없습니다.</p> : null}
    {points.length ? <p className="mt-2 text-xs text-zinc-500">{points[0].date} ~ {points.at(-1)?.date} · {points.length}개 관측값{reference.length ? " · 지수 왼쪽 축" : ""}</p> : null}
  </div>;
}

export function IndexTurnoverChart({ market, rows }: { market: IndexMarket; rows: IndexDay[] }) {
  const [period, setPeriod] = useState(63);
  const result = indexTurnoverProfile(rows, period);
  const max = result ? Math.max(...result.bins.map(bin => bin.turnover)) : 0;
  return <section className="rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="font-semibold">{markets[market]} 매물대</h2>
      <div className="flex flex-wrap gap-1" aria-label={`${markets[market]} 매물대 거래일 수`}>
        {periods.map(days => <button key={days} type="button" aria-pressed={period === days} className={`${button} ${selected(period === days)}`} onClick={() => setPeriod(days)}>{days}일</button>)}
      </div>
    </div>
    {result && result.total > 0 ? <>
      <p className="mt-2 text-sm text-zinc-300">{result.through} KRX 15:30 종가 <span className="font-semibold text-emerald-300">{display(result.lastClose)} pt</span></p>
      <p className="mt-1 text-xs text-zinc-400">{result.from} ~ {result.through} · 거래대금 확인 {result.coveredDays}/{result.priceDays}일</p>
      <ol className="mt-4 space-y-1.5 text-xs" aria-label="지수 구간별 거래대금">
        {result.bins.map((bin, i) => ({ ...bin, i })).reverse().map(bin => {
          const active = bin.i === result.currentBin, share = bin.turnover / result.total * 100;
          return <li key={bin.low} className="grid grid-cols-[minmax(104px,auto)_1fr_44px] items-center gap-2 tabular-nums" title={`${display(bin.turnover / 1e12)}조원 · ${display(share)}%`}>
            <span className={active ? "text-emerald-200" : "text-zinc-400"}>{display(bin.low)}–{display(bin.high)}</span>
            <span className="h-4 overflow-hidden rounded-sm bg-white/5"><span className={`block h-full ${active ? "bg-emerald-400" : "bg-blue-400/60"}`} style={{ width: `${bin.turnover / max * 100}%` }} /></span>
            <span className="text-right text-zinc-400">{share.toFixed(1)}%</span>
          </li>;
        })}
      </ol>
    </> : <p className="mt-4 text-sm text-zinc-400">가격과 거래대금이 같은 날 확인된 KRX 자료가 없습니다.</p>}
  </section>;
}
