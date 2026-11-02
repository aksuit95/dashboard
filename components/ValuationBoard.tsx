"use client";

import { ColorType, createChart, LineStyle, type LineData } from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ValuationData, ValuationSeries } from "@/lib/valuation/types";

const ranges = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827, ALL: Infinity };
type Range = keyof typeof ranges;
function number(value: number, digits: number) { return value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function timestamp(value: string) { return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }); }

export function ValuationBoard() {
  const [data, setData] = useState<ValuationData | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState("per");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reading = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (reading.current) return;
    reading.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/valuation", { cache: "no-store", signal });
      const result = await response.json() as { data: ValuationData | null; exportedAt?: string; error?: string };
      if (!response.ok || !result.data?.series?.length) throw new Error(result.error ?? "내보낸 데이터를 읽지 못했습니다.");
      if (!signal?.aborted) { setData(result.data); setExportedAt(result.exportedAt ?? null); setError(null); }
    } catch (cause) {
      if (!signal?.aborted) setError(`${cause instanceof Error ? cause.message : "데이터를 읽지 못했습니다."} 마지막 표시값을 유지합니다.`);
    } finally { reading.current = false; if (!signal?.aborted) setBusy(false); }
  }, []);

  useEffect(() => {
    // One initial read, then explicit refresh only. Ignore legacy browser file caches.
    // Keep the initial fetch shared across React's development effect replay.
    void refresh();
  }, [refresh]);

  const active = data?.series.find((series) => series.id === selected) ?? data?.series[0];
  return <div className="space-y-5">
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${data && !error ? "bg-emerald-400" : "bg-zinc-500"}`} /><span className="font-medium">{data?.fileName ?? "코스피200 데이터"}</span><span className="text-xs text-zinc-500">JSON 스냅샷 · 수동 반영</span></div>
        <p className="mt-1 text-xs text-zinc-400">{data ? `엑셀 저장 ${timestamp(data.savedAt)} KST` : "내보낸 데이터를 확인하고 있습니다…"}</p>
        {exportedAt && <p className="mt-1 text-xs text-zinc-500">데이터 내보내기 {timestamp(exportedAt)} KST</p>}
      </div>
      <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40">{busy ? "읽는 중…" : "데이터 반영"}</button>
    </section>
    {error && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">{error}</p>}
    {data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {data.series.map((series) => {
          const latest = series.points.at(-1)!;
          return <button type="button" key={series.id} aria-pressed={active?.id === series.id} onClick={() => setSelected(series.id)} className={`rounded-xl border p-4 text-left transition-colors ${active?.id === series.id ? "border-sky-400/50 bg-sky-400/[0.06]" : "border-white/10 bg-[#151a22] hover:border-white/25"}`}>
            <div className="flex items-center gap-2 text-xs text-zinc-400"><span className="h-1.5 w-1.5 rounded-full" style={{ background: series.color }} />{series.name}</div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{number(latest.value, series.digits)} <span className="text-xs font-normal text-zinc-500">{series.unit}</span></p>
            <p className="mt-2 text-[11px] text-zinc-500">{latest.date} 기준</p>
          </button>;
        })}
      </div>
      {active && <ValuationChart series={active} />}
      {data.warnings.length > 0 && <details className="rounded-lg border border-amber-400/15 bg-amber-400/[0.03] px-4 py-3 text-xs text-amber-200">
        <summary className="cursor-pointer">원본 데이터 확인 필요 · {data.warnings.length}건</summary>
        <ul className="mt-3 space-y-2">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </details>}
    </>}
    {!data && !busy && <div className="rounded-xl border border-dashed border-white/15 py-20 text-center"><p className="text-zinc-300">데이터를 불러오지 못했습니다.</p><p className="mt-2 text-sm text-zinc-500">연결 상태를 확인하고 ‘데이터 반영’을 다시 눌러 주세요.</p></div>}
    <div className="space-y-1 text-xs leading-relaxed text-zinc-500">
      <p>출처: QuantiWise · 모든 선행 항목은 Fwd.12M · 지표를 누르면 선차트가 바뀝니다.</p>
      <p>로컬에서 내보낸 최신 데이터를 배포한 뒤 ‘데이터 반영’을 누르거나 페이지를 새로 열어 주세요. 주기적으로 확인하지 않습니다.</p>
      <p>지표별 실제 제공 기간만 표시합니다. 결측값을 0으로 채우거나 다른 지표의 날짜에 맞춰 옮기지 않습니다.</p>
    </div>
  </div>;
}


function ValuationChart({ series }: { series: ValuationSeries }) {
  const [range, setRange] = useState<Range>("1Y");
  const [hover, setHover] = useState<{ date: string; value: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => {
    const end = Date.parse(`${series.points.at(-1)?.date}T00:00:00Z`);
    return series.points.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= end - ranges[range] * 86_400_000);
  }, [series, range]);
  const mean = selected.reduce((sum, point) => sum + point.value, 0) / selected.length;
  useEffect(() => {
    if (!host.current || !selected.length) return;
    setHover(null);
    const element = host.current;
    const chart = createChart(element, {
      width: element.clientWidth, height: 370,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#ffffff04" }, horzLines: { color: "#ffffff0a" } },
      rightPriceScale: { borderColor: "#ffffff10", scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderColor: "#ffffff10" },
      localization: { locale: "ko-KR", priceFormatter: (value: number) => number(value, series.digits) },
    });
    const line = chart.addLineSeries({ color: series.color, lineWidth: 2, priceFormat: { type: "price", precision: series.digits, minMove: 10 ** -series.digits } });
    line.setData(selected.map((p) => ({ time: p.date, value: p.value })));
    line.createPriceLine({ price: mean, color: "#71717a", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "기간 평균" });
    chart.subscribeCrosshairMove((event) => {
      const point = event.seriesData.get(line) as LineData | undefined;
      if (!event.time || !point || !("value" in point)) { setHover(null); return; }
      const time = event.time;
      const date = typeof time === "string" ? time : typeof time === "number" ? new Date(time * 1000).toISOString().slice(0, 10) : `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
      setHover({ date, value: point.value });
    });
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth }));
    observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [series, selected, mean]);
  const detail = hover ?? selected.at(-1);
  return <section className="rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-6" aria-label={`${series.name} 선차트`}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-widest text-zinc-500">KOSPI 200 · 12M Forward</p><h2 className="mt-1 text-lg font-semibold">{series.name}</h2>
        <p className="mt-3 flex items-baseline gap-3"><span className="text-3xl font-semibold tabular-nums" style={{ color: series.color }}>{detail ? number(detail.value, series.digits) : "—"}<span className="ml-1 text-sm font-normal">{series.unit}</span></span><span className="text-xs text-zinc-500">{detail?.date}</span></p>
      </div>
      <div className="flex flex-wrap gap-1" aria-label="차트 기간">{(Object.keys(ranges) as Range[]).map((value) => <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)} className={`rounded-md px-2.5 py-1.5 text-xs ${range === value ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>{value === "ALL" ? "전체" : value}</button>)}</div>
    </div>
    <div ref={host} className="h-[370px] w-full" />
    <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-white/5 pt-3 text-xs text-zinc-500"><span>{selected[0]?.date} ~ {selected.at(-1)?.date} · {selected.length.toLocaleString("ko-KR")}개 관측값</span><span>점선: 선택 기간 평균 {number(mean, series.digits)}{series.unit}</span></div>
    <p className="mt-2 text-[11px] text-zinc-600">{series.sheet} · {series.itemCode}</p>
  </section>;
}
