"use client";

import { ColorType, createChart, CrosshairMode, LineStyle, type Time } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import config from "@/config/market-indicators.json";
import { KR_HOLIDAYS, US_HOLIDAYS } from "@/config/market-calendar";
import { alignIndicator, calendarDates, downsampleAligned, indicatorChange, selectIndicatorRange, validateIndicatorPoints, type AlignedIndicatorPoint, type IndicatorData, type IndicatorDefinition, type IndicatorMetadata, type IndicatorRange, type SupplementalIndicator } from "@/lib/market/indicator-chart";

type StaticIndicator = IndicatorDefinition & { dataPath: string; defaultOn: boolean; hidden: boolean };
type Indicator = IndicatorDefinition & { group: "market" | SupplementalIndicator["group"] };
type DataState = Record<string, IndicatorData>;
type Mode = "normalized" | "raw";
type ChartLine = { item: Indicator; points: AlignedIndicatorPoint[]; axis: "left" | "right" };
const staticIndicators = (config as StaticIndicator[]).filter(item => !item.hidden);
const groups = [
  { id: "market", label: "지수·ADR·금리·환율" },
  { id: "liquidity", label: "증시자금" },
  { id: "funds", label: "주식형 펀드" },
  { id: "derivatives", label: "파생 포지션" },
] as const;
const nativeDifferences = [
  { unit: "억원", title: "자금 흐름 증감" },
  { unit: "계약", title: "선물 순매수 증감" },
  { unit: "배", title: "풋·콜 비율 변화" },
] as const;
const ranges: IndicatorRange[] = ["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y"];
const krHolidays = new Set(Object.keys(KR_HOLIDAYS));
const usHolidays = new Set(Object.keys(US_HOLIDAYS));
const noHolidays = new Set<string>();
const dateString = (time: Time | undefined): string | null => {
  if (typeof time === "string") return time;
  if (time && typeof time === "object") return `${time.year}-${String(time.month).padStart(2,"0")}-${String(time.day).padStart(2,"0")}`;
  return null;
};
const formatValue = (item: Indicator, value: number) => {
  const digits = item.unit === "계약" ? 0 : 2;
  const separator = ["조원", "억원", "계약"].includes(item.unit) ? " " : "";
  return `${value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${separator}${item.unit}`;
};
const formatTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? `${new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST` : "—";

function staleKrxClose(item: Indicator, entry: IndicatorData | undefined, expected: string | null) {
  return item.group === "market" && item.calendar === "KRX" && Boolean(entry?.meta.asOf && expected && entry.meta.asOf !== expected);
}

function ChartPanel({ title, description, lines, onHover, thresholds = false }: { title: string; description: string; lines: ChartLine[]; onHover: (date: string | null) => void; thresholds?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || !lines.length) return;
    const chart = createChart(element, {
      width: element.clientWidth, height: element.clientHeight,
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
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [lines, onHover, thresholds]);
  return <div className="mt-4 border-t border-white/5 pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-1"><h3 className="text-sm font-medium text-zinc-200">{title}</h3><p className="text-xs text-zinc-500">{description}</p></div>
    <div ref={host} className="mt-2 h-[360px] w-full sm:h-[460px]" aria-label={`${title} 차트`} />
  </div>;
}

export function MarketIndicatorChart({ expectedKrxDate, liquidity }: { expectedKrxDate: string | null; liquidity: SupplementalIndicator[] }) {
  const [range, setRange] = useState<IndicatorRange>("3M");
  const [mode, setMode] = useState<Mode>("normalized");
  const [selected, setSelected] = useState<string[]>(() => staticIndicators.filter(item => item.defaultOn).map(item => item.id));
  const [staticData, setStaticData] = useState<DataState>({});
  const [loading, setLoading] = useState(true);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(staticIndicators.map(async item => {
      try {
        const [valuesResponse, metaResponse] = await Promise.all([fetch(item.dataPath, { signal: controller.signal }), fetch(item.dataPath.replace(/\.json$/, ".meta.json"), { signal: controller.signal })]);
        if (!valuesResponse.ok || !metaResponse.ok) throw new Error(`HTTP ${!valuesResponse.ok ? valuesResponse.status : metaResponse.status}`);
        const meta = await metaResponse.json() as IndicatorMetadata;
        if (!["ok", "error", "not_configured"].includes(meta.status) || typeof meta.source !== "string" || typeof meta.basis !== "string") throw new Error("출처 정보 형식 오류");
        const raw: unknown = await valuesResponse.json();
        const points = Array.isArray(raw) && raw.length === 0 ? [] : validateIndicatorPoints(raw);
        if (meta.status === "ok" && (!points.length || meta.asOf !== points.at(-1)?.date)) throw new Error("자료 기준일 불일치");
        return [item.id, { points, meta, ...(meta.status === "error" ? { error: meta.error ?? "수집 실패" } : {}) }] as const;
      } catch (error) {
        return [item.id, { points: [], meta: { status: "error", source: "확인 불가", basis: "확인 불가" } as IndicatorMetadata, error: error instanceof Error ? error.message : "불러오기 실패" }] as const;
      }
    })).then(entries => { if (!controller.signal.aborted) { setStaticData(Object.fromEntries(entries)); setLoading(false); } });
    return () => controller.abort();
  }, []);
  const indicators = useMemo<Indicator[]>(() => [
    ...staticIndicators.map(item => ({ ...item, group: "market" as const })),
    ...liquidity.map(({ definition, group }) => ({ ...definition, group })),
  ], [liquidity]);
  const data = useMemo<DataState>(() => ({
    ...staticData, ...Object.fromEntries(liquidity.map(item => [item.definition.id, item.data])),
  }), [liquidity, staticData]);
  const allAvailable = useMemo(() => Object.values(data).flatMap(item => item.points.length ? [item.points] : []), [data]);
  const endDate = useMemo(() => allAvailable.map(points => points[points.length - 1].date).sort().at(-1) ?? null, [allAvailable]);
  const startDate = useMemo(() => allAvailable.map(points => points[0].date).sort()[0] ?? null, [allAvailable]);
  const dates = useMemo(() => startDate && endDate ? calendarDates(startDate, endDate) : [], [startDate, endDate]);
  const visible = useMemo(() => indicators.filter(item => selected.includes(item.id) && data[item.id]?.points.length), [indicators, selected, data]);
  const windowed = useMemo(() => Object.fromEntries(visible.map(item => {
    const holidays = item.calendar === "KRX" ? krHolidays : item.calendar === "US" ? usHolidays : noHolidays;
    const aligned = alignIndicator(data[item.id].points, dates, holidays, item.group === "market");
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
    return [{ item, points: transformed, axis: mode === "normalized" ? (item.change === "return" ? "left" as const : "right" as const) : item.axis }];
  }), [visible, windowed, mode]);
  const rawGroups = useMemo(() => [
    { id: "index", title: "주가지수", description: "왼쪽 축 · 지수 포인트" },
    { id: "breadth", title: "등락비율 ADR", description: "오른쪽 축 · % · 점선 75 / 100 / 120" },
    { id: "rate", title: "미국 국채 금리", description: "오른쪽 축 · 수익률 %" },
    { id: "fx", title: "원/달러 환율", description: "오른쪽 축 · 원" },
    { id: "cash", title: "증시자금·주식형 펀드 잔액", description: "오른쪽 축 · 조원" },
    { id: "cash-eok", title: "미수금·반대매매", description: "오른쪽 축 · 억원" },
    { id: "forced-sale-pct", title: "미수금 대비 반대매매 비중", description: "오른쪽 축 · %" },
    { id: "turnover", title: "코스피·코스닥 거래대금", description: "오른쪽 축 · 조원" },
    { id: "fund-flow", title: "주식형 펀드 순설정액", description: "오른쪽 축 · 억원" },
    { id: "contracts", title: "코스피200 선물 포지션", description: "오른쪽 축 · 계약" },
    { id: "put-call", title: "코스피200 옵션 풋·콜 비율", description: "오른쪽 축 · 배" },
    { id: "volatility", title: "코스피200 변동성지수", description: "오른쪽 축 · 지수 포인트" },
  ].map(group => ({ ...group, lines: chartLines.filter(line => line.item.rawGroup === group.id) })).filter(group => group.lines.length), [chartLines]);
  const normalized = useMemo(() => chartLines.filter(line => !nativeDifferences.some(group => group.unit === line.item.differenceUnit)), [chartLines]);
  const changeGroups = useMemo(() => nativeDifferences.map(group => ({ ...group, lines: chartLines.filter(line => line.item.differenceUnit === group.unit) })), [chartLines]);
  const selectedItems = indicators.filter(item => selected.includes(item.id));
  return <section className="mb-6 rounded-xl border border-indigo-400/25 bg-[#151a22] p-4 sm:p-5" aria-label="시장 지표 장기 비교">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-white">시장 지표 장기 비교</h2><span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">일별 데이터</span></div>
      <p className="mt-1 text-sm leading-6 text-zinc-400">코스피·코스닥은 KRX 정규장 지수, ADR은 네이버 KRX 일봉 기준입니다. 증시자금과 펀드는 원본 통계의 기준일을 사용합니다.</p></div></div>
    <div className="mt-4 space-y-3" aria-label="표시할 지표">
      {groups.map(group => <div key={group.id} role="group" aria-label={group.label} className="grid gap-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-3">
        <span className="text-xs font-medium text-zinc-400">{group.label}</span>
        <div className="flex flex-wrap gap-1.5">{indicators.filter(item => item.group === group.id).map(item => {
        const active = selected.includes(item.id); const entry = data[item.id];
        const missing = entry?.meta.status === "not_configured"; const failed = Boolean(entry?.error);
        const stale = staleKrxClose(item, entry, expectedKrxDate);
        return <button key={item.id} type="button" aria-pressed={active} title={failed ? `데이터 오류: ${entry.error}` : missing ? "데이터 출처 미설정" : stale ? "최신 거래일 미반영" : item.label}
          onClick={() => { setHoverDate(null); setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id]); }}
          className="rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          style={active ? { backgroundColor: item.color, borderColor: item.color, color: "#10141b" } : { backgroundColor: "#242a34", borderColor: "#3f4652", color: "#a1a1aa" }}>{item.label}{missing ? " · 미연결" : failed || stale ? " ⚠" : ""}</button>;
        })}</div>
      </div>)}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1" aria-label="차트 기간">{ranges.map(item => <button key={item} type="button" aria-pressed={range === item} onClick={() => { setRange(item); setHoverDate(null); }} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${range === item ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/5"}`}>{item}</button>)}</div>
      <div className="flex rounded-lg border border-white/10 p-1" aria-label="차트 표시 방식">{([ ["normalized","정규화"], ["raw","원시값"] ] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setHoverDate(null); }} className={`rounded px-3 py-1 text-xs ${mode === value ? "bg-white/15 text-white" : "text-zinc-400"}`}>{label}</button>)}</div>
    </div>
    <p className="mt-2 text-xs text-zinc-500">차트 끝 날짜 {endDate ?? "—"} · {mode === "normalized" ? "지수·잔액 등 시작점 100 / ADR·금리 시작 대비 %p" : "단위별 원시값"}</p>
    <div className="mt-3 rounded-lg bg-black/15 p-3 text-xs leading-6 text-zinc-300" aria-live="polite">
      {loading ? "데이터를 불러오는 중입니다." : selectedItems.length ? <><p className="mb-2 font-medium text-zinc-200">{hoverDate ? `${hoverDate} · 값 / 기간 시작 대비` : "최근 관측값 · 기간 시작 대비"}</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{selectedItems.map(item => {
        const points = windowed[item.id] ?? [];
        const point = hoverDate ? points.find(p => p.date === hoverDate) : points.findLast(p => p.value !== null && p.date === p.sourceDate);
        const base = points.find(p => p.value !== null);
        const delta = point?.value != null && base?.value != null ? indicatorChange(point.value, base.value, item.change, item.differenceUnit) : "—";
        const unavailable = data[item.id]?.meta.status === "not_configured" ? "출처 미설정" : "—";
        const actualDate = point?.sourceDate && (!hoverDate || point.sourceDate !== point.date) ? point.sourceDate : null;
        const shortDate = (date: string) => date.slice(2).replaceAll("-", ".");
        return <div key={item.id} className="min-w-0 break-words text-[10px] leading-[14px] sm:text-xs sm:leading-4" title={`${item.label} · 시작 ${base?.sourceDate ?? "—"}${actualDate ? ` · 실제 값 기준일 ${actualDate}` : ""}`}>
          <div className="font-medium text-zinc-200"><span style={{color:item.color}}>●</span> {item.label}</div>
          <div>{point?.value != null ? formatValue(item, point.value) : unavailable}</div>
          <div className="text-zinc-400">{delta}</div>
          {base?.sourceDate && <div className="text-zinc-500">시작 {shortDate(base.sourceDate)}</div>}
          {actualDate && <div className="text-zinc-500">기준 {shortDate(actualDate)}</div>}
        </div>;
      })}</div></> : "표시할 지표를 선택해 주세요."}
    </div>
    {mode === "normalized" && normalized.length > 0 && <ChartPanel title="정규화 비교" description="왼쪽 축 · 시작점 100 / 오른쪽 축 · 시작 대비 %p" lines={normalized} onHover={setHoverDate} />}
    {mode === "normalized" && changeGroups.filter(group => group.lines.length).map(group => <ChartPanel key={group.unit} title={group.title} description={`오른쪽 축 · 기간 시작 대비 ${group.unit}`} lines={group.lines} onHover={setHoverDate} />)}
    {mode === "raw" && rawGroups.map(group => <ChartPanel key={group.id} title={group.title} description={group.description} lines={group.lines} onHover={setHoverDate} thresholds={group.id === "breadth"} />)}
    {!loading && !chartLines.length && <p className="py-10 text-center text-sm text-zinc-500">선택한 기간에 표시할 데이터가 없습니다.</p>}
    {invalidBases.length > 0 && mode === "normalized" && <p role="status" className="mt-2 text-xs text-amber-300">시작값이 0 이하인 지표는 정규화에서 제외됩니다: {invalidBases.map(item => item.label).join(", ")}</p>}
    <div className="mt-4 space-y-1 text-xs leading-5 text-zinc-400">{selectedItems.map(item => {
      const entry = data[item.id]; if (!entry) return null;
      const stale = staleKrxClose(item, entry, expectedKrxDate);
      return <p key={item.id}><span style={{color:item.color}}>●</span> {item.label} · <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{entry.meta.source}</a> · {entry.meta.basis}{entry.meta.asOf ? ` · 기준일 ${entry.meta.asOf}` : ""}{entry.meta.coverageStart ? ` · 이력 ${entry.meta.coverageStart}부터` : ""}{entry.meta.fetchedAt ? ` · 수집 ${formatTime(entry.meta.fetchedAt)}` : ""}{entry.meta.status === "not_configured" ? " · 출처 미설정" : ""}{entry.error ? ` · 갱신 실패: ${entry.error}` : ""}{stale ? ` · 최신 거래일 ${expectedKrxDate} 미반영` : ""}</p>;
    })}</div>
    {selectedItems.some(item => item.rawGroup === "rate") && <p className="mt-2 text-xs leading-5 text-zinc-500">미국 재무부는 2021-12-06부터 국채 파 수익률 곡선 산출 방식을 변경했습니다.</p>}
    <p className="mt-3 text-xs leading-5 text-zinc-500">기간 시작은 지표별 구간 첫 유효 관측일입니다. 새로 추가한 자금·펀드·파생 지표는 실제 관측일에만 표시합니다. 지수·ADR·금리·환율의 주말과 확인된 휴장일에는 원본 날짜를 함께 표시합니다. ADR 이력은 현재 구성종목으로 과거를 재구성합니다. 미국 지표와 원/달러는 각 원본의 기준 시각을 따릅니다.</p>
  </section>;
}
