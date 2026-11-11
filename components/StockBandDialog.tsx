"use client";

import { ColorType, createChart } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MinerviniBar } from "@/lib/market/minervini";
import type { StockHistoryPoint } from "@/lib/valuation/stock-history";
import { forwardBandLevels, matchForwardHistory } from "@/lib/valuation/stock-forward";

type Kind = "per" | "pbr";
const colors = ["#64748b", "#38bdf8", "#fbbf24", "#fb7185", "#a78bfa"];

export function StockBandDialog({ code, name, bars, onClose }: { code: string; name: string; bars: MinerviniBar[]; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("per");
  const [points, setPoints] = useState<StockHistoryPoint[] | null>(null);
  const [error, setError] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/valuation/stocks/history?code=${encodeURIComponent(code)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("history unavailable");
      const data = await response.json() as { code: string; points: StockHistoryPoint[] };
      if (data.code !== code || !Array.isArray(data.points)) throw new Error("invalid history");
      setPoints(data.points);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [code]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const matched = useMemo(() => matchForwardHistory(points ?? [], bars, kind).filter(point => point.denominator > 0), [bars, points, kind]);
  const levels = useMemo(() => forwardBandLevels(matched), [matched]);
  useEffect(() => {
    const element = host.current;
    if (!element || !levels.length) return;
    const chart = createChart(element, { width: element.clientWidth, height: 360, layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" }, grid: { vertLines: { color: "#ffffff04" }, horzLines: { color: "#ffffff0a" } }, timeScale: { borderColor: "#ffffff10" }, rightPriceScale: { borderColor: "#ffffff10" }, localization: { locale: "ko-KR" } });
    const price = chart.addLineSeries({ color: "#f4f4f5", lineWidth: 2, title: "KRX 종가", priceLineVisible: false });
    price.setData(matched.map(p => ({ time: p.date, value: p.price })));
    levels.forEach((level, index) => { const series = chart.addLineSeries({ color: colors[index], lineWidth: 1, title: `${level}배`, priceLineVisible: false }); series.setData(matched.map(p => ({ time: p.date, value: p.denominator * level }))); });
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth })); observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [levels, matched]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="stock-band-title" className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-white/15 bg-[#151a22] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="stock-band-title" className="text-lg font-semibold">{name} 밸류에이션 밴드</h2><p className="mt-1 text-xs text-zinc-400">KRX 15:30 정규장 종가 · 동일 기준일의 선행 추정치</p></div><button type="button" autoFocus onClick={onClose} aria-label="밴드 차트 닫기" className="rounded-md border border-white/15 px-3 py-1 text-sm">닫기</button></div>
      <div className="my-4 flex gap-2" aria-label="밴드 지표">{(["per", "pbr"] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)} className={`rounded-md px-3 py-2 text-xs ${kind === value ? "bg-sky-500/20 text-sky-300" : "bg-white/5 text-zinc-400"}`}>{value.toUpperCase()} 밴드</button>)}</div>
      {error ? <p role="status" className="py-20 text-center text-sm text-amber-200">밸류에이션 이력을 불러오지 못했습니다.</p> : !points ? <p role="status" className="py-20 text-center text-sm text-zinc-400">이력을 불러오고 있습니다…</p> : levels.length ? <><div ref={host} className="h-[360px] w-full" /><p className="mt-3 text-xs text-zinc-400">밴드 배수: {levels.map(level => `${level}배`).join(" · ")} · 동일 기준일 {matched.length}개 관측값의 중앙 배수를 기준으로 표시합니다.</p><p className="mt-2 text-xs text-zinc-500">밴드 = 해당일 선행 {kind === "per" ? "EPS" : "BPS"} × 배수. 관측일 사이 선은 관측값을 연결한 것이며 그 사이의 실제 추정치를 뜻하지 않습니다.</p></> : <p role="status" className="rounded-lg border border-dashed border-white/15 px-5 py-16 text-center text-sm leading-6 text-zinc-400">같은 날짜의 KRX 종가와 선행 {kind === "per" ? "EPS" : "BPS"} 이력이 2개 이상 필요합니다.<br />현재 자료에는 기준일이 확인된 과거 추정치가 부족해 밴드를 표시할 수 없습니다.</p>}
    </section>
  </div>;
}
