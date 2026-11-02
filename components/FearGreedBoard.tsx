"use client";

import { ColorType, createChart, LineStyle, type LineData } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { fearGreedRating, nextFearGreedRefresh, type FearGreedBoard as Board } from "@/lib/sources/fear-greed";

const ranges = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, ALL: Infinity };
const bands = [
  { label: "극단적 공포", color: "#f87171", width: 25 },
  { label: "공포", color: "#fb923c", width: 20 },
  { label: "중립", color: "#a1a1aa", width: 10 },
  { label: "탐욕", color: "#a3e635", width: 20 },
  { label: "극단적 탐욕", color: "#34d399", width: 25 },
];

function color(score: number) {
  return bands[score < 25 ? 0 : score < 45 ? 1 : score <= 55 ? 2 : score <= 75 ? 3 : 4].color;
}

function timestamp(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export function FearGreedBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true);
      try {
        const response = await fetch("/api/fear-greed", { signal: controller.signal, cache: "no-store" });
        const data = await response.json() as Board & { error?: string };
        if (!response.ok || !("snapshot" in data)) throw new Error();
        if (!controller.signal.aborted) {
          // Preserve an existing chart even if a new server instance has no saved data.
          setBoard((previous) => data.snapshot ? data : previous?.snapshot ? { ...previous, stale: true } : data);
          setError(data.error ?? null);
        }
      } catch {
        if (!controller.signal.aborted) setError("지수를 갱신하지 못했습니다. 마지막 표시값을 유지합니다.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void load();
    let timer = 0;
    function schedule() {
      timer = window.setTimeout(() => {
        if (!document.hidden) void load();
        schedule();
      }, nextFearGreedRefresh() - Date.now() + 1000);
    }
    schedule();
    // Returning to a tab reads the daily cache; it does not force a CNN request.
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort(); window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const snapshot = board?.snapshot;
  const delta = snapshot && snapshot.previousClose != null ? snapshot.score - snapshot.previousClose : null;
  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-6" aria-label="CNN 공포·탐욕 지수">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">CNN Fear &amp; Greed Index</h2>
          <p className="mt-1 text-sm text-zinc-400">미국 주식시장 공포·탐욕 지수 · 0은 극단적 공포, 100은 극단적 탐욕</p>
        </div>
        <button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)} className="rounded border border-white/15 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-40">
          {busy ? "불러오는 중…" : "새로고침"}
        </button>
      </div>
      {error ? <p role="status" className="mt-3 text-sm text-amber-300">{error}</p> : null}
      {!snapshot ? <p className="py-10 text-sm text-zinc-500">{busy ? "CNN 지수와 과거 데이터를 불러오고 있습니다…" : "표시할 데이터가 없습니다."}</p> : <>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-5xl font-semibold tabular-nums" style={{ color: color(snapshot.score) }}>{snapshot.score.toFixed(1)}</span>
              <span className="text-lg" style={{ color: color(snapshot.score) }}>{fearGreedRating(snapshot.score)}</span>
              <span className="text-xs text-zinc-400">전일 대비 {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}p`}</span>
            </div>
            <div className="relative mt-5" role="meter" aria-label="공포·탐욕 점수" aria-valuenow={snapshot.score} aria-valuemin={0} aria-valuemax={100}>
              <div className="flex h-3 overflow-hidden rounded-full">{bands.map((band) => <div key={band.label} style={{ background: band.color, width: `${band.width}%` }} />)}</div>
              <span className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded bg-white ring-2 ring-[#151a22]" style={{ left: `${snapshot.score}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-zinc-500"><span>0 · 공포</span><span>50 · 중립</span><span>탐욕 · 100</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["전일 종가", snapshot.previousClose], ["1주 전", snapshot.previousWeek],
              ["1개월 전", snapshot.previousMonth], ["1년 전", snapshot.previousYear],
            ] as const).map(([label, value]) => <div key={label} className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-xs text-zinc-400">{label}</p>
              <p className="mt-2 text-2xl font-medium tabular-nums" style={{ color: value == null ? undefined : color(value) }}>{value?.toFixed(1) ?? "—"}</p>
              <p className="mt-1 text-xs text-zinc-400">{value == null ? "데이터 없음" : fearGreedRating(value)}</p>
            </div>)}
          </div>
        </div>
        <div className="mt-6"><HistoryChart points={snapshot.points} /></div>
        <p className="mt-3 text-xs text-zinc-500">지수 기준 {timestamp(snapshot.asOf)} KST · 수집 {board?.fetchedAt ? timestamp(board.fetchedAt) : "—"} KST{board?.stale ? " · 갱신 지연" : ""}</p>
      </>}
      <p className="mt-3 text-xs text-zinc-500"><a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noreferrer" className="underline">출처: CNN</a> · 매일 오전 10시 이후 확인 (KST) · 같은 날에는 저장값 표시 · 마지막 점은 수집 시점의 최신 수치</p>
    </section>
  );
}

function HistoryChart({ points }: { points: { date: string; value: number }[] }) {
  const [range, setRange] = useState<keyof typeof ranges>("1Y");
  const [hover, setHover] = useState<{ date: string; value: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => {
    const end = Date.parse(`${points.at(-1)?.date}T00:00:00Z`);
    return points.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= end - ranges[range] * 86_400_000);
  }, [points, range]);

  useEffect(() => {
    if (!host.current || !selected.length) return;
    setHover(null);
    const element = host.current;
    const chart = createChart(element, {
      width: element.clientWidth, height: 280,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#ffffff06" }, horzLines: { color: "#ffffff0c" } },
      rightPriceScale: { borderColor: "#27272a" },
      timeScale: { borderColor: "#27272a" },
      localization: { locale: "ko-KR" },
    });
    const series = chart.addLineSeries({
      color: "#38bdf8", lineWidth: 2,
      priceFormat: { type: "price", precision: 1, minMove: 0.1 },
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    series.setData(selected.map((point) => ({ time: point.date, value: point.value })));
    for (const [value, title, color] of [[25, "공포", "#fb923c"], [45, "중립 하단", "#71717a"], [55, "중립 상단", "#71717a"], [75, "탐욕", "#a3e635"]] as const) {
      series.createPriceLine({ price: value, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
    }
    chart.subscribeCrosshairMove((event) => {
      const point = event.seriesData.get(series) as LineData | undefined;
      if (!event.time || !point || !("value" in point)) { setHover(null); return; }
      const time = event.time;
      const date = typeof time === "string" ? time : typeof time === "number" ? new Date(time * 1000).toISOString().slice(0, 10) : `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
      setHover({ date, value: point.value });
    });
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth }));
    observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [selected]);

  const detail = hover ?? selected.at(-1);
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1" aria-label="차트 기간">{(Object.keys(ranges) as (keyof typeof ranges)[]).map((item) => <button type="button" key={item} aria-pressed={range === item} onClick={() => setRange(item)} className={`rounded px-3 py-1 text-xs ${range === item ? "bg-white/15 text-white" : "text-zinc-500"}`}>{item === "ALL" ? "전체" : item}</button>)}</div>
      <p className="text-xs text-zinc-400" aria-live="off">{detail ? `${detail.date} · ${detail.value.toFixed(1)} · ${fearGreedRating(detail.value)}` : "데이터 없음"}</p>
    </div>
    <div ref={host} className="w-full" aria-label="공포·탐욕 지수 추이 선차트" />
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">{bands.map((band) => <span key={band.label}><span style={{ color: band.color }}>●</span> {band.label}</span>)}</div>
  </div>;
}
