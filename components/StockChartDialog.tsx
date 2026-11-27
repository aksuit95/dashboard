"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ColorType, createChart, type SeriesMarker, type Time } from "lightweight-charts";
import { calculateRadarMetrics, radarPeriods, type RadarPeriod, type RadarPoint, type StockChartData, type StockChartRequest } from "@/lib/stock-radar/model";

const periodLabels: Record<RadarPeriod, string> = { "1m": "1개월", "3m": "3개월", "52w": "52주" };
const marketLabels = { KOSPI: "코스피", KOSDAQ: "코스닥" };
const priceFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const formatPrice = (value: number) => priceFormat.format(value);

function StockRadarChart({ points, markers }: { points: RadarPoint[]; markers: SeriesMarker<Time>[] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      height: 260, autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#252c35" }, horzLines: { color: "#252c35" } },
      rightPriceScale: { borderColor: "#343b45" }, timeScale: { borderColor: "#343b45" },
      localization: { priceFormatter: formatPrice },
    });
    const line = chart.addLineSeries({ color: "#5eead4", lineWidth: 2, priceLineVisible: false });
    line.setData(points.map(point => ({ time: point.date, value: point.price })));
    line.setMarkers(markers);
    const edge = Math.max(1, Math.ceil(points.length * 0.02));
    chart.timeScale().setVisibleLogicalRange({ from: -edge, to: points.length - 1 + edge });
    return () => chart.remove();
  }, [points, markers]);
  return <div ref={host} role="img" aria-label="KRX 종가 추이 차트" className="h-[260px] w-full" />;
}

export default function StockChartDialog({ stock, onClose }: { stock: StockChartRequest; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [result, setResult] = useState<{ data: StockChartData } | { error: string } | null>(null);
  const { code, name, radar } = stock;
  const period = radar?.period ?? "52w";
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ period });
        if (radar) {
          params.set("asOf", radar.asOf);
          params.set("fetchedAt", radar.fetchedAt);
        }
        const response = await fetch("/api/stock-radar/" + encodeURIComponent(code) + "?" + params, {
          signal: controller.signal, cache: "no-store",
        });
        const data = await response.json() as StockChartData & { error?: string };
        if (!response.ok || !Array.isArray(data.points) || data.points.length < 2) {
          throw new Error(data.error ?? "차트를 불러오지 못했습니다.");
        }
        if (!controller.signal.aborted) setResult({ data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error instanceof Error ? error.message : "차트를 불러오지 못했습니다." });
      }
    }
    void load();
    return () => controller.abort();
  }, [code, period, radar]);

  const data = result && "data" in result ? result.data : null;
  const levels = useMemo(() => {
    if (!data) return [];
    const current = data.points[data.points.length - 1];
    const metrics = calculateRadarMetrics(data.points, data.points.length - 1);
    if (!metrics) return [];
    const high = metrics.breakoutPct !== null;
    const low = metrics.breakdownPct !== null;
    const candidates = radar?.tab === "drawdown" ? [
      { point: metrics.currentPeak, label: "기간 고점", color: "#fbbf24", above: true },
      { point: metrics.mddPeak, label: "MDD 고점", color: "#fb7185", above: true },
      { point: metrics.mddTrough, label: "MDD 저점", color: "#7dd3fc", above: false },
    ] : [
      { point: metrics.priorHigh, label: "직전 고점", color: "#fb7185", above: true },
      { point: metrics.priorLow, label: "직전 저점", color: "#7dd3fc", above: false },
      { point: current, label: high ? "신고가" : low ? "신저가" : "최근 종가", color: "#5eead4", above: !low },
    ];
    const byDate = new Map<string, typeof candidates[number]>();
    for (const level of candidates) {
      const existing = byDate.get(level.point.date);
      if (existing) existing.label += " · " + level.label;
      else byDate.set(level.point.date, level);
    }
    return [...byDate.values()];
  }, [data, radar?.tab]);
  const markers = useMemo<SeriesMarker<Time>[]>(() =>
    [...levels].sort((a, b) => a.point.date.localeCompare(b.point.date)).map(({ point, color, above }) => ({
      time: point.date, position: above ? "aboveBar" : "belowBar", shape: "circle", color,
    })), [levels]);

  const range = data && data.points.length < radarPeriods[period] + 1
    ? "최근 " + data.points.length + "거래일" : periodLabels[period];
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby={title} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-xl border border-white/15 bg-[#151a22] p-4 text-zinc-100 shadow-2xl backdrop:bg-black/70 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id={title} className="text-lg font-semibold">{name} <span className="ml-1 text-sm font-normal text-zinc-400">{code}</span></h2>
          <p className="mt-1 text-xs text-zinc-400">{data
            ? marketLabels[data.market] + " · " + range + " · " + data.asOf + " KRX 정규장 종가 · " + data.priceTime
            : "KRX 정규장 종가"}</p>
        </div>
        <button type="button" autoFocus onClick={() => ref.current?.close()} className="shrink-0 rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10">닫기</button>
      </div>
      {data ? (
        <>
          <StockRadarChart points={data.points} markers={markers} />
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            {levels.map(({ point, label, color }) => <div key={label} className="rounded-md bg-white/5 p-3 text-xs">
              <dt style={{ color }}>{label}</dt><dd className="mt-1 tabular-nums">{formatPrice(point.price)}원 · {point.date}</dd>
            </div>)}
          </dl>
          {data.adjusted && <p className="mt-3 text-xs text-zinc-400">확인된 주식 수 변동 조정계수를 과거 종가에 적용했습니다.</p>}
        </>
      ) : (
        <p role="status" className="px-3 py-14 text-center text-sm text-zinc-400">
          {result && "error" in result ? result.error : "KRX 종가 차트를 불러오는 중입니다."}
        </p>
      )}
    </dialog>
  );
}
