"use client";

import { ColorType, createChart, LineStyle, type AutoscaleInfo, type IChartApi, type ISeriesApi, type LineWidth, type SeriesMarker, type SeriesType, type Time } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { chartRanges, type IndexTechnicalAnalysis, type IndexTechnicalPoint } from "@/lib/market/index-technical";
import { type IndexRules } from "@/lib/market/index-rules";
import { timeframeLabels, type IndexTimeframe } from "@/lib/market/index-timeframe";
import type { SwingLevel } from "@/lib/market/index-levels";
import type { IndexBacktest } from "@/lib/market/index-backtest";

const up = "#fb7185";
const down = "#60a5fa";
const lineColors = ["#fbbf24", "#38bdf8", "#c084fc", "#34d399"];
const maPeriods = [20, 60, 120, 200] as const;
const overlays = [{ id: "bands", label: "볼린저밴드" }, { id: "swing", label: "스윙 지지·저항" }, { id: "fib", label: "피보나치" }, { id: "profile", label: "매물대 중심" }, { id: "extra", label: "5·50일선" }] as const;
const modes = [{ id: "disparity", label: "이격도" }, { id: "rsi", label: "RSI" }, { id: "macd", label: "MACD" }, { id: "stochastic", label: "스토캐스틱" }, { id: "width", label: "밴드폭" }] as const;
type Mode = typeof modes[number]["id"];
type Line = { label: string; color: string; value: (p: IndexTechnicalPoint) => number | null; dashed?: boolean };
type Reference = { price: number; color: string; title?: string; lineWidth?: LineWidth };
const format = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const extraLines: Line[] = [
  { label: "5일선", color: "#e2e8f0", value: p => p.averages[5] },
  { label: "50일선", color: "#fb923c", value: p => p.averages[50] },
];
const bands: Line[] = [
  { label: "볼밴 상단", color: "#94a3b8", value: p => p.bands?.upper ?? null, dashed: true },
  { label: "볼밴 하단", color: "#94a3b8", value: p => p.bands?.lower ?? null, dashed: true },
];
const indicatorLines: Record<Exclude<Mode, "disparity">, Line[]> = {
  rsi: [{ label: "RSI(14)", color: "#a78bfa", value: p => p.rsi }],
  macd: [
    { label: "MACD", color: "#38bdf8", value: p => p.macd?.line ?? null },
    { label: "시그널", color: "#fbbf24", value: p => p.macd?.signal ?? null },
  ],
  stochastic: [
    { label: "%K", color: "#38bdf8", value: p => p.stochastic.k },
    { label: "%D", color: "#fbbf24", value: p => p.stochastic.d },
  ],
  width: [{ label: "밴드폭 %", color: "#c084fc", value: p => p.bands?.width ?? null }],
};

function markerDate(time?: Time) {
  if (typeof time === "string") return time;
  if (typeof time === "object") return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  return "";
}

function makeChart(element: HTMLDivElement, points: IndexTechnicalPoint[], inspect: (p: IndexTechnicalPoint | null) => void) {
  const chart = createChart(element, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
    grid: { vertLines: { color: "#212833" }, horzLines: { color: "#272f3c" } },
    rightPriceScale: { borderColor: "#353d4b" },
    timeScale: { borderColor: "#353d4b", minBarSpacing: 1, rightOffset: 2 },
    localization: { locale: "ko-KR", priceFormatter: (value: number) => format.format(value) },
  });
  const byDate = new Map(points.map(p => [p.date, p]));
  chart.subscribeCrosshairMove(({ time }) => inspect(byDate.get(markerDate(time)) ?? null));
  return chart;
}

function addReferences<T extends SeriesType>(series: ISeriesApi<T>, references: Reference[]) {
  for (const line of references) series.createPriceLine({ lineWidth: 1, ...line, lineStyle: LineStyle.Dashed, axisLabelVisible: true });
}

function levelScale(references: Reference[]) {
  return (base: () => AutoscaleInfo | null) => {
    const info = base();
    if (!info?.priceRange || !references.length) return info;
    const prices = references.map(item => item.price);
    return { ...info, priceRange: { minValue: Math.min(info.priceRange.minValue, ...prices), maxValue: Math.max(info.priceRange.maxValue, ...prices) } };
  };
}

function addLine(chart: IChartApi, points: IndexTechnicalPoint[], line: Line, references: Reference[] = []) {
  const series = chart.addLineSeries({
    color: line.color, lineWidth: 1, lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
    priceLineVisible: false, lastValueVisible: false,
    autoscaleInfoProvider: levelScale(references),
  });
  series.setData(points.map(point => {
    const value = line.value(point);
    return value === null ? { time: point.date } : { time: point.date, value };
  }));
  addReferences(series, references);
  return series;
}

function Legend({ point, entries }: { point: IndexTechnicalPoint; entries: Line[] }) {
  return <div className="my-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs tabular-nums">
    <time dateTime={point.date} className="text-zinc-400">{point.date}</time>{point.incomplete && <span className="text-amber-300">미완성</span>}
    {entries.map(entry => {
      const value = entry.value(point);
      return <span key={entry.label} className="inline-flex items-center gap-1.5 text-zinc-400">
        <span aria-hidden="true" className="h-0.5 w-3" style={{ backgroundColor: entry.color }} />{entry.label}
        <strong className="font-medium text-zinc-100">{value === null ? "—" : format.format(value)}</strong>
      </span>;
    })}
  </div>;
}

const panel = "min-w-0 rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-5";
const button = (active: boolean) => `rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-emerald-400 ${active ? "bg-white/15 text-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`;
const closes: Line = { label: "종가", color: "#e2e8f0", value: p => p.close };
const histogram: Line = { label: "히스토그램", color: "#94a3b8", value: p => p.macd?.histogram ?? null };

export function IndexTechnicalCharts({ name, analysis, timeframe, rules, eventMarkers }: {
  name: string; analysis: IndexTechnicalAnalysis; timeframe: IndexTimeframe; rules: IndexRules; eventMarkers: IndexBacktest["events"] | null;
}) {
  const ranges = chartRanges[timeframe];
  const timeframeLabel = timeframeLabels[timeframe];
  const unit = timeframe === "day" ? "일" : "봉";
  const [range, setRange] = useState<number | "all">(ranges[2]);
  const [visible, setVisible] = useState({ bands: true, swing: true, fib: false, profile: false, extra: false });
  const [mode, setMode] = useState<Mode>("disparity");
  const [thresholdIndex, setThresholdIndex] = useState(0);
  const [priceHover, setPriceHover] = useState<string | null>(null);
  const [indicatorHover, setIndicatorHover] = useState<string | null>(null);
  const [levelHover, setLevelHover] = useState<SwingLevel | null>(null);
  const priceHost = useRef<HTMLDivElement>(null);
  const indicatorHost = useRef<HTMLDivElement>(null);
  const plottedAverages = timeframe === "day" ? maPeriods : analysis.trendPeriods;
  const priceLines = useMemo<Line[]>(() => plottedAverages.map((period, i) => ({ label: `${period}${unit}선`, color: lineColors[i], value: p => p.averages[period] ?? null })), [plottedAverages, unit]);
  const threshold = rules.maPeriods[thresholdIndex];
  const disparityLines = useMemo<Line[]>(() => [
    ...rules.maPeriods.map((period, i) => ({ label: `${period}${unit}`, color: lineColors[i], value: (p: IndexTechnicalPoint) => p.disparity[period]?.value ?? null })),
    { label: `P${rules.pctlUpper}`, color: "#fb7185", dashed: true, value: p => p.disparity[threshold]?.reference?.upper ?? null },
    { label: `P${rules.pctlLower}`, color: "#60a5fa", dashed: true, value: p => p.disparity[threshold]?.reference?.lower ?? null },
  ], [rules.maPeriods, rules.pctlUpper, rules.pctlLower, threshold, unit]);
  const activeIndicatorLines = mode === "disparity" ? disparityLines : indicatorLines[mode];
  const visibleEvents = useMemo(() => new Set(eventMarkers?.map(item => item.date)), [eventMarkers]);

  useEffect(() => {
    if (!priceHost.current) return;
    const points = range === "all" ? analysis.points : analysis.points.slice(-range);
    const chart = makeChart(priceHost.current, points, point => setPriceHover(point?.date ?? null));
    if (range === "all") chart.timeScale().applyOptions({ minBarSpacing: 0.25 });
    const levels = analysis.levels;
    const references: Reference[] = [
      ...(visible.swing ? levels.swings.map(level => ({ price: level.price, color: level.side === "support" ? down : up, title: level.side === "support" ? "지지" : "저항",
        lineWidth: (level.touches >= 4 ? 3 : level.touches >= 2 ? 2 : 1) as LineWidth })) : []),
      ...(visible.fib ? levels.fibonacci?.levels.map(level => ({ price: level.price, color: "#a78bfa", title: `${level.ratio}%` })) ?? [] : []),
      ...(visible.profile && levels.profile ? [{ price: levels.profile.control, color: "#2dd4bf", title: "매물대" }] : []),
    ];
    const hasCandles = points.some(point => point.bar !== null);
    const signalMarkers = (withCandle: boolean): SeriesMarker<Time>[] => points.flatMap(point =>
      (point.bar !== null) === withCandle && visibleEvents.has(point.date) ? [{ time: point.date, color: "#34d399", shape: "square", position: "inBar" }] : []);
    let locator: { priceToCoordinate(price: number): number | null } | undefined;
    if (hasCandles) {
      const series = chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceLineVisible: false,
        autoscaleInfoProvider: levelScale(references) });
      series.setData(points.map(p => {
        if (p.bar === null) return { time: p.date };
        const muted = p.bar.close >= p.bar.open ? "#fb718570" : "#60a5fa70";
        return { ...p.bar, time: p.date, ...(p.incomplete ? { color: muted, wickColor: muted } : {}) };
      }));
      addReferences(series, references);
      locator = series;
      const chartDates = new Set(points.filter(point => point.bar !== null).map(point => point.date));
      const candidates: SeriesMarker<Time>[] = visible.swing ? levels.candidates.filter(item => chartDates.has(item.date)).map(item => ({ time: item.date,
        color: "#fbbf24", shape: "circle", position: item.kind === "high" ? "aboveBar" : "belowBar" })) : [];
      series.setMarkers([...candidates, ...signalMarkers(true)].sort((a, b) => String(a.time).localeCompare(String(b.time))));
    }
    if (!hasCandles || points.some(point => point.close !== null && point.bar === null)) {
      const closeSeries = addLine(chart, points, closes, hasCandles ? [] : references);
      closeSeries.setMarkers(signalMarkers(false));
      locator ??= closeSeries;
    }
    for (const line of [...priceLines, ...(visible.extra && timeframe === "day" ? extraLines : []), ...(visible.bands ? bands : [])]) addLine(chart, points, line);
    chart.subscribeCrosshairMove(({ point }) => {
      let nearest: SwingLevel | null = null;
      let distance = 8;
      if (point && visible.swing && locator) for (const level of levels.swings) {
        const y = locator.priceToCoordinate(level.price);
        if (y === null || Math.abs(point.y - y) >= distance) continue;
        nearest = level;
        distance = Math.abs(point.y - y);
      }
      setLevelHover(nearest);
    });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [analysis, range, visible, timeframe, priceLines, visibleEvents]);

  useEffect(() => {
    if (!indicatorHost.current) return;
    const points = range === "all" ? analysis.points : analysis.points.slice(-range);
    const chart = makeChart(indicatorHost.current, points, point => setIndicatorHover(point?.date ?? null));
    if (range === "all") chart.timeScale().applyOptions({ minBarSpacing: 0.25 });
    const references: Reference[] = mode === "rsi" ? [{ price: 70, color: up }, { price: 30, color: down }] :
      mode === "stochastic" ? [{ price: 80, color: up }, { price: 20, color: down }] :
      mode === "width" && analysis.bandwidthThreshold !== null ? [{ price: analysis.bandwidthThreshold, color: "#64748b", title: "P10" }] : [];

    if (mode === "macd") {
      const series = chart.addHistogramSeries({ base: 0, lastValueVisible: false, priceLineVisible: false });
      series.setData(points.map(p => {
        const value = histogram.value(p);
        return value === null ? { time: p.date } : { time: p.date, value, color: value >= 0 ? "#fb718580" : "#60a5fa80" };
      }));
    }
    activeIndicatorLines.forEach((line, i) => addLine(chart, points, line, i === 0 ? references : []));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [analysis, mode, range, activeIndicatorLines]);

  const current = analysis.points.find(point => point.date === priceHover) ?? analysis.chartLatest;
  const priceEntries = [closes, ...priceLines, ...(visible.extra && timeframe === "day" ? extraLines : []), ...(visible.bands ? bands : [])];
  const selectedIndicator = analysis.points.find(point => point.date === indicatorHover) ?? analysis.latest;
  const noStochastic = analysis.latest.stochastic.k === null;

  return <>
    <section className={panel} aria-label={`${name} ${timeframeLabel} 차트`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-zinc-100">{name} {timeframeLabel}</h2>
        <div role="group" aria-label="표시 기간" className="flex flex-wrap gap-1">
          {([...ranges, "all"] as const).map(period => <button key={period} type="button" aria-pressed={range === period} className={button(range === period)} onClick={() => { setRange(period); setPriceHover(null); setIndicatorHover(null); setLevelHover(null); }}>{period === "all" ? "전체" : `${period}${unit}`}</button>)}
        </div>
      </div>
      <div role="group" aria-label="차트 오버레이" className="mt-3 flex flex-wrap gap-1">
        {overlays.filter(item => timeframe === "day" || item.id !== "extra").map(item => <button key={item.id} type="button" aria-pressed={visible[item.id]} className={button(visible[item.id])} onClick={() => { setLevelHover(null); setVisible(old => ({ ...old, [item.id]: !old[item.id] })); }}>{item.label}</button>)}
      </div>
      <Legend point={current} entries={priceEntries} />
      <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400 tabular-nums">
        <span>시가 {current.bar ? format.format(current.bar.open) : "—"}</span><span>고가 {current.bar ? format.format(current.bar.high) : "—"}</span><span>저가 {current.bar ? format.format(current.bar.low) : "—"}</span><span>거래량 {current.bar ? `${current.bar.volume.toLocaleString("ko-KR")}주` : "—"}</span>
      </p>
      <div className="relative">
        <div ref={priceHost} className="h-[320px] w-full sm:h-[410px]" aria-hidden="true" />
        {visible.swing && levelHover && analysis.levels.swings.includes(levelHover) && <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-slate-500 bg-[#121923] px-3 py-2 text-xs leading-5 text-zinc-100 shadow-lg">
          <strong>{levelHover.side === "support" ? "지지" : "저항"} {format.format(levelHover.price)}</strong><br />{levelHover.touches}회 터치 · 마지막 터치 {levelHover.lastTouch}
        </div>}
      </div>
      {visible.swing && analysis.levels.candidates.length > 0 && <p className="mt-2 text-xs text-amber-300">● 미확정 스윙 후보 · 오른쪽 {rules.swingN}봉까지 조건을 충족해야 확정됩니다.</p>}
      {eventMarkers && <p className="mt-2 text-xs text-emerald-300">■ 과거 신호 · 현재 차트 범위 {eventMarkers.filter(item => range === "all" || item.date >= (analysis.points.at(-range)?.date ?? "")).length}회</p>}
      {!analysis.chartLatest.bar && <p className="mt-2 text-xs text-amber-200">최신 {timeframeLabel} 시·고·저가가 결측입니다. 확인된 종가를 선으로 표시합니다.</p>}
    </section>

    <section className={panel} aria-label={`${name} 보조지표 차트`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-zinc-100">보조지표</h2>
        <div role="group" aria-label="보조지표 선택" className="flex flex-wrap gap-1">
          {modes.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} className={button(mode === item.id)} onClick={() => { setMode(item.id); setIndicatorHover(null); }}>{item.label}</button>)}
        </div>
      </div>
      {mode === "disparity" && <div role="group" aria-label="백분위 기준 이동평균" className="mt-2 flex flex-wrap items-center gap-1 text-xs text-zinc-400">
        <span className="mr-1">임계선</span>
        {rules.maPeriods.map((period, i) => <button key={period} type="button" aria-pressed={threshold === period} className={button(threshold === period)} onClick={() => setThresholdIndex(i)}>{period}{unit}</button>)}
        <span className="ml-1">{rules.expanding ? "각 봉 직전 분포" : `고정 기준일 ${rules.calibrationEnd ?? "미선택"}`}</span>
      </div>}
      <Legend point={selectedIndicator} entries={mode === "macd" ? [...activeIndicatorLines, histogram] : activeIndicatorLines} />
      {mode === "disparity" && <p className="mb-2 text-xs text-zinc-400">{selectedIndicator.disparity[threshold]?.reference ? `임계치 유효 표본 ${selectedIndicator.disparity[threshold].reference?.samples}봉` : "선택한 봉의 이격도 임계치 표본이 부족하거나 기준일 이전입니다."}</p>}
      <div ref={indicatorHost} className="h-56 w-full" aria-hidden="true" />
      {mode === "stochastic" && noStochastic && <p className="mt-2 text-xs text-amber-200">확인된 KRX 고가·저가 이력이 부족합니다.</p>}
    </section>
  </>;
}
