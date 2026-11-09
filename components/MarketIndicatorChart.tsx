"use client";

import { ColorType, createChart, CrosshairMode, LineStyle, type Time } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import config from "@/config/market-indicators.json";
import { KR_HOLIDAYS, US_HOLIDAYS } from "@/config/market-calendar";
import { alignIndicator, calendarDates, downsampleAligned, indicatorChange, selectIndicatorRange, validateIndicatorPoints, type AlignedIndicatorPoint, type ChangeMethod, type IndicatorPoint, type IndicatorRange } from "@/lib/market/indicator-chart";

type Indicator = (typeof config)[number];
type Metadata = { status: "ok" | "error" | "not_configured"; source: string; basis: string; asOf?: string; fetchedAt?: string; coverageStart?: string; error?: string };
type DataState = Record<string, { points: IndicatorPoint[]; meta: Metadata; error?: string }>;
type Mode = "normalized" | "raw";
type ChartLine = { item: Indicator; points: AlignedIndicatorPoint[]; axis: "left" | "right" };
const indicators: Indicator[] = config.filter(item => !item.hidden);
const ranges: IndicatorRange[] = ["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y"];
const krHolidays = new Set(Object.keys(KR_HOLIDAYS));
const usHolidays = new Set(Object.keys(US_HOLIDAYS));
const noHolidays = new Set<string>();
const dateString = (time: Time | undefined): string | null => {
  if (typeof time === "string") return time;
  if (time && typeof time === "object") return `${time.year}-${String(time.month).padStart(2,"0")}-${String(time.day).padStart(2,"0")}`;
  return null;
};
const formatValue = (item: Indicator, value: number) => `${value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${item.unit === "%" ? "%" : item.unit === "원" ? "원" : "pt"}`;
const formatTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? `${new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST` : "—";

function ChartPanel({ title, description, lines, onHover, thresholds = false }: { title: string; description: string; lines: ChartLine[]; onHover: (date: string | null) => void; thresholds?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || !lines.length) return;
    const chart = createChart(element, {
      width: element.clientWidth, height: 290,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#242b35" }, horzLines: { color: "#242b35" } },
      leftPriceScale: { visible: lines.some(line => line.axis === "left"), borderColor: "#333b46" },
      rightPriceScale: { visible: lines.some(line => line.axis === "right"), borderColor: "#333b46" },
      timeScale: { borderColor: "#333b46", timeVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#71717a", style: LineStyle.Dashed }, horzLine: { color: "#71717a", style: LineStyle.Dashed } },
      handleScroll: false, handleScale: false,
    });
    lines.forEach((entry, index) => {
      const line = chart.addLineSeries({ color: entry.item.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceScaleId: entry.axis, priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        ...(thresholds && index === 0 ? { autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
          const info = base();
          return info ? { ...info, priceRange: { minValue: Math.min(info.priceRange.minValue, 75), maxValue: Math.max(info.priceRange.maxValue, 120) } } : null;
        } } : {}),
      });
      line.setData(downsampleAligned(entry.points).map(point => point.value === null ? { time: point.date } : { time: point.date, value: point.value }));
      if (thresholds && index === 0) for (const value of [75,100,120]) line.createPriceLine({ price: value, color: value === 120 ? "#fb7185" : value === 75 ? "#60a5fa" : "#71717a", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true });
    });
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove(param => onHover(dateString(param.time)));
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth }));
    observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [lines, onHover, thresholds]);
  return <div className="mt-4 border-t border-white/5 pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-1"><h3 className="text-sm font-medium text-zinc-200">{title}</h3><p className="text-xs text-zinc-500">{description}</p></div>
    <div ref={host} className="mt-2 w-full" aria-label={`${title} 차트`} />
  </div>;
}

export function MarketIndicatorChart({ expectedKrxDate }: { expectedKrxDate: string | null }) {
  const [range, setRange] = useState<IndicatorRange>("3M");
  const [mode, setMode] = useState<Mode>("normalized");
  const [selected, setSelected] = useState<string[]>(() => indicators.filter(item => item.defaultOn).map(item => item.id));
  const [data, setData] = useState<DataState>({});
  const [loading, setLoading] = useState(true);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(indicators.map(async item => {
      try {
        const [valuesResponse, metaResponse] = await Promise.all([fetch(item.dataPath, { signal: controller.signal }), fetch(item.dataPath.replace(/\.json$/, ".meta.json"), { signal: controller.signal })]);
        if (!valuesResponse.ok || !metaResponse.ok) throw new Error(`HTTP ${!valuesResponse.ok ? valuesResponse.status : metaResponse.status}`);
        const meta = await metaResponse.json() as Metadata;
        if (!["ok", "error", "not_configured"].includes(meta.status) || typeof meta.source !== "string" || typeof meta.basis !== "string") throw new Error("출처 정보 형식 오류");
        const raw: unknown = await valuesResponse.json();
        const points = Array.isArray(raw) && raw.length === 0 ? [] : validateIndicatorPoints(raw);
        if (meta.status === "ok" && (!points.length || meta.asOf !== points.at(-1)?.date)) throw new Error("자료 기준일 불일치");
        return [item.id, { points, meta, ...(meta.status === "error" ? { error: meta.error ?? "수집 실패" } : {}) }] as const;
      } catch (error) {
        return [item.id, { points: [], meta: { status: "error", source: "확인 불가", basis: "확인 불가" } as Metadata, error: error instanceof Error ? error.message : "불러오기 실패" }] as const;
      }
    })).then(entries => { if (!controller.signal.aborted) { setData(Object.fromEntries(entries)); setLoading(false); } });
    return () => controller.abort();
  }, []);
  const allAvailable = useMemo(() => Object.values(data).flatMap(item => item.points.length ? [item.points] : []), [data]);
  const endDate = useMemo(() => allAvailable.map(points => points[points.length - 1].date).sort().at(-1) ?? null, [allAvailable]);
  const startDate = useMemo(() => allAvailable.map(points => points[0].date).sort()[0] ?? null, [allAvailable]);
  const dates = useMemo(() => startDate && endDate ? calendarDates(startDate, endDate) : [], [startDate, endDate]);
  const visible = useMemo(() => indicators.filter(item => selected.includes(item.id) && data[item.id]?.points.length), [selected, data]);
  const windowed = useMemo(() => Object.fromEntries(visible.map(item => {
    const holidays = item.calendar === "KRX" ? krHolidays : item.calendar === "US" ? usHolidays : noHolidays;
    const aligned = alignIndicator(data[item.id].points, dates, holidays);
    return [item.id, endDate ? selectIndicatorRange(aligned, range, endDate) : []];
  })), [visible, data, range, endDate, dates]);
  const invalidBases = useMemo(() => visible.filter(item => {
    const first = windowed[item.id]?.find(point => point.value !== null);
    return item.change === "return" && first?.value != null && first.value <= 0;
  }), [visible, windowed]);
  const chartLines = useMemo<ChartLine[]>(() => visible.flatMap(item => {
    const points = windowed[item.id] ?? [];
    const baseline = points.find(point => point.value !== null)?.value;
    if (baseline == null || (mode === "normalized" && item.change === "return" && baseline <= 0)) return [];
    const transformed = points.map(point => ({ ...point, value: point.value === null ? null : mode === "raw" ? point.value : item.change === "return" ? point.value / baseline * 100 : point.value - baseline }));
    return [{ item, points: transformed, axis: mode === "normalized" ? (item.change === "return" ? "left" as const : "right" as const) : item.axis as "left" | "right" }];
  }), [visible, windowed, mode]);
  const rawGroups = useMemo(() => [
    { id: "index", title: "주가지수", description: "왼쪽 축 · 지수 포인트" },
    { id: "breadth", title: "등락비율 ADR", description: "오른쪽 축 · % · 점선 75 / 100 / 120" },
    { id: "rate", title: "미국 국채 금리", description: "오른쪽 축 · 수익률 %" },
    { id: "fx", title: "원/달러 환율", description: "오른쪽 축 · 원" },
  ].map(group => ({ ...group, lines: chartLines.filter(line => line.item.rawGroup === group.id) })).filter(group => group.lines.length), [chartLines]);
  const currentDate = hoverDate ?? endDate;
  const selectedItems = indicators.filter(item => selected.includes(item.id));
  return <section className="mb-6 rounded-xl border border-indigo-400/25 bg-[#151a22] p-4 sm:p-5" aria-label="시장 지표 장기 비교">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-white">시장 지표 장기 비교</h2><span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">일별 데이터</span></div>
      <p className="mt-1 text-sm leading-6 text-zinc-400">코스피·코스닥은 KRX 정규장 지수, ADR은 네이버 KRX 일봉 기준입니다. 미국 지표는 각 시장의 현지 기준일을 사용합니다.</p></div></div>
    <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2" aria-label="표시할 지표">
      {indicators.map(item => {
        const active = selected.includes(item.id); const entry = data[item.id];
        const missing = entry?.meta.status === "not_configured"; const failed = Boolean(entry?.error);
        const stale = item.calendar === "KRX" && Boolean(entry?.meta.asOf && expectedKrxDate && entry.meta.asOf !== expectedKrxDate);
        return <button key={item.id} type="button" aria-pressed={active} title={failed ? `데이터 오류: ${entry.error}` : missing ? "데이터 출처 미설정" : stale ? "최신 거래일 미반영" : item.label}
          onClick={() => { setHoverDate(null); setSelected(previous => active ? previous.filter(id => id !== item.id) : [...previous, item.id]); }}
          className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          style={active ? { backgroundColor: item.color, borderColor: item.color, color: "#10141b" } : { backgroundColor: "#242a34", borderColor: "#3f4652", color: "#a1a1aa" }}>{item.label}{missing ? " · 미연결" : failed || stale ? " ⚠" : ""}</button>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1" aria-label="차트 기간">{ranges.map(item => <button key={item} type="button" aria-pressed={range === item} onClick={() => { setRange(item); setHoverDate(null); }} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${range === item ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/5"}`}>{item}</button>)}</div>
      <div className="flex rounded-lg border border-white/10 p-1" aria-label="차트 표시 방식">{([ ["normalized","정규화"], ["raw","원시값"] ] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setHoverDate(null); }} className={`rounded px-3 py-1 text-xs ${mode === value ? "bg-white/15 text-white" : "text-zinc-400"}`}>{label}</button>)}</div>
    </div>
    <p className="mt-2 text-xs text-zinc-500">차트 끝 날짜 {endDate ?? "—"} · {mode === "normalized" ? "지수·환율 시작점 100 / ADR·금리 시작 대비 %p" : "서로 다른 단위는 패널을 분리"}</p>
    <div className="mt-3 rounded-lg bg-black/15 p-3 text-xs leading-6 text-zinc-300" aria-live="polite">
      {loading ? "데이터를 불러오는 중입니다." : selectedItems.length ? <><p className="mb-1 font-medium text-zinc-200">{currentDate ?? "—"} · 값 / 기간 시작 대비</p><div className="flex flex-wrap gap-x-4 gap-y-1">{selectedItems.map(item => {
        const points = windowed[item.id] ?? []; const point = currentDate ? points.find(p => p.date === currentDate) : undefined; const base = points.find(p => p.value !== null);
        const delta = point?.value != null && base?.value != null ? indicatorChange(point.value, base.value, item.change as ChangeMethod, item.differenceUnit as "bp" | "pp" | null) : "—";
        const unavailable = data[item.id]?.meta.status === "not_configured" ? "출처 미설정" : "—";
        return <span key={item.id}><span style={{color:item.color}}>●</span> {item.label} {point?.value != null ? formatValue(item, point.value) : unavailable} <span className="text-zinc-500">({delta}{base?.sourceDate ? ` · 시작 ${base.sourceDate}` : ""}{point?.sourceDate && point.sourceDate !== point.date ? ` · ${point.sourceDate} 값` : ""})</span></span>;
      })}</div></> : "표시할 지표를 선택해 주세요."}
    </div>
    {mode === "normalized" && chartLines.length > 0 && <ChartPanel title="정규화 비교" description="왼쪽: 시작점 100 · 오른쪽: 시작 대비 %p" lines={chartLines} onHover={setHoverDate} />}
    {mode === "raw" && rawGroups.map(group => <ChartPanel key={group.id} title={group.title} description={group.description} lines={group.lines} onHover={setHoverDate} thresholds={group.id === "breadth"} />)}
    {!loading && !chartLines.length && <p className="py-10 text-center text-sm text-zinc-500">선택한 기간에 표시할 데이터가 없습니다.</p>}
    {invalidBases.length > 0 && mode === "normalized" && <p role="status" className="mt-2 text-xs text-amber-300">시작값이 0 이하인 지표는 정규화에서 제외됩니다: {invalidBases.map(item => item.label).join(", ")}</p>}
    <div className="mt-4 space-y-1 text-xs leading-5 text-zinc-400">{selectedItems.map(item => {
      const entry = data[item.id]; if (!entry) return null;
      const stale = item.calendar === "KRX" && Boolean(entry.meta.asOf && expectedKrxDate && entry.meta.asOf !== expectedKrxDate);
      return <p key={item.id}><span style={{color:item.color}}>●</span> {item.label} · <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{entry.meta.source}</a> · {entry.meta.basis}{entry.meta.asOf ? ` · 기준일 ${entry.meta.asOf}` : ""}{entry.meta.coverageStart ? ` · 이력 ${entry.meta.coverageStart}부터` : ""}{entry.meta.fetchedAt ? ` · 수집 ${formatTime(entry.meta.fetchedAt)}` : ""}{entry.meta.status === "not_configured" ? " · 출처 미설정" : ""}{entry.error ? ` · 갱신 실패: ${entry.error}` : ""}{stale ? ` · 최신 거래일 ${expectedKrxDate} 미반영` : ""}</p>;
    })}</div>
    {selectedItems.some(item => item.rawGroup === "rate") && <p className="mt-2 text-xs leading-5 text-zinc-500">미국 재무부는 2021-12-06부터 국채 파 수익률 곡선 산출 방식을 변경했습니다.</p>}
    <p className="mt-3 text-xs leading-5 text-zinc-500">기간 시작은 지표별 구간 첫 유효 관측일입니다. 같은 날짜라도 미국 장 마감은 한국 정규장 마감보다 늦습니다. 주말과 확인된 휴장일에만 직전 값을 표시하며 원본 날짜를 함께 표기합니다. 확인되지 않은 결측은 비워 둡니다. ADR 이력은 현재 구성종목으로 과거를 재구성해 다른 자료와 차이가 날 수 있습니다. 원/달러는 Yahoo의 런던 시간 기준 완료 일봉으로 한국 정규장 종가와 기준 시각이 다릅니다.</p>
  </section>;
}
