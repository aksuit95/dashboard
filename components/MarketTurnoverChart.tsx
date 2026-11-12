"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, createChart } from "lightweight-charts";

type Point = { date: string; value: number };
export function MarketTurnoverChart({ market, points, error, asOf, collectedAt }: { market: string; points?: Point[]; error?: string | null; asOf: string; collectedAt?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [months, setMonths] = useState<3 | 6 | 12>(12);
  const [hover, setHover] = useState<{ date: string; value: number } | null>(null);
  const filtered = useMemo(() => { const start = new Date(`${asOf}T00:00:00Z`); start.setUTCMonth(start.getUTCMonth() - months); return (points ?? []).filter(p => p.date >= start.toISOString().slice(0,10)); }, [points, asOf, months]);
  useEffect(() => {
    if (!host.current || !filtered.length) return;
    const element = host.current;
    const chart = createChart(element, { width: element.clientWidth, height: 260, layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" }, grid: { vertLines: { color: "#ffffff05" }, horzLines: { color: "#ffffff0b" } }, timeScale: { borderColor: "#ffffff15" }, rightPriceScale: { borderColor: "#ffffff15" }, localization: { locale: "ko-KR" } });
    const series = chart.addHistogramSeries({ color: "#38bdf8", priceFormat: { type: "custom", formatter: (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) } });
    series.setData(filtered.map(p => ({ time: p.date, value: p.value / 1e8 })));
    chart.subscribeCrosshairMove(param => { const point = param.seriesData.get(series); if (typeof param.time === "string" && point && "value" in point) setHover({ date: param.time, value: point.value }); else setHover(null); });
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth })); observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [filtered]);
  const latest = filtered.at(-1);
  return <section className="space-y-4 rounded-xl border border-white/10 bg-[#151a22] p-4 md:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{market} 전체 거래대금 추이</h2><p className="mt-2 text-xs leading-relaxed text-zinc-400">KRX 정규시장 전체 · 일별 거래대금 · 억 원 · 기준일 {asOf} · 수집 {collectedAt ? `${new Date(collectedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} KST` : "미확인"}</p></div><div className="flex gap-1" aria-label="거래대금 조회 기간">{([3,6,12] as const).map(n=><button key={n} onClick={()=>setMonths(n)} aria-pressed={n===months} className={`rounded px-3 py-2 text-xs ${n===months ? "bg-white/15 text-white" : "text-zinc-500"}`}>{n===12 ? "1년" : `${n}개월`}</button>)}</div></div>
    {error ? <p role="status" className="text-sm text-amber-300">거래대금 조회 실패: {error}</p> : !points ? <p role="status" className="text-sm text-zinc-400">저장된 거래대금 이력이 없습니다. 다음 정규 수집 후 표시됩니다.</p> : !filtered.length ? <p className="text-sm text-zinc-400">이 기간에 표시할 자료가 없습니다.</p> : <><p className="text-xs text-zinc-400">{hover?.date ?? latest?.date} · 거래대금 {(hover?.value ?? (latest!.value / 1e8)).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}억 원</p><div ref={host} aria-label={`${market} KRX 일별 거래대금 차트`} /></>}
  </section>;
}
