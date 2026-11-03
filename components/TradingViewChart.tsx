"use client";

import { ColorType, createChart, type CandlestickData } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MinerviniBar } from "@/lib/market/minervini";

const ranges = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827, ALL: Infinity };
type Range = keyof typeof ranges;
const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

export function TradingViewChart({ code, name }: { code: string; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [book, setBook] = useState<{ code: string; bars: MinerviniBar[]; priceBasis: string; asOf: string; fetchedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [range, setRange] = useState<Range>("1Y");
  const [hover, setHover] = useState<MinerviniBar | null>(null);
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`KRX:${code}`)}`;
  const bars = book?.code === code && book.priceBasis === "KRX_REGULAR_CLOSE" ? book.bars : null;
  const selected = useMemo(() => {
    if (!bars?.length) return [];
    const end = Date.parse(`${bars.at(-1)!.date}T00:00:00Z`);
    return bars.filter(bar => Date.parse(`${bar.date}T00:00:00Z`) >= end - ranges[range] * 86_400_000);
  }, [bars, range]);
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setHover(null);
    void (async () => {
      try {
        const response = await fetch(`/api/valuation/stocks/candles?code=${encodeURIComponent(code)}&basis=krx-1530`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { code?: string; bars?: MinerviniBar[]; priceBasis?: string; asOf?: string; fetchedAt?: string; error?: string };
        if (!response.ok || !result.bars?.length || result.code !== code || result.priceBasis !== "KRX_REGULAR_CLOSE" || !result.asOf || !result.fetchedAt) throw new Error(result.error ?? "KRX 정규장 일봉을 확인할 수 없습니다.");
        if (!controller.signal.aborted) setBook({ code, bars: result.bars, priceBasis: result.priceBasis, asOf: result.asOf, fetchedAt: result.fetchedAt });
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "일봉을 불러오지 못했습니다."); }
    })();
    return () => controller.abort();
  }, [code, attempt]);
  useEffect(() => {
    const element = host.current;
    if (!element || !selected.length) return;
    setHover(null);
    const chart = createChart(element, {
      width: element.clientWidth, height: 420,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#ffffff04" }, horzLines: { color: "#ffffff0a" } },
      rightPriceScale: { borderColor: "#ffffff10", scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { borderColor: "#ffffff10" }, localization: { locale: "ko-KR" },
    });
    const candles = chart.addCandlestickSeries({ upColor: "#fb7185", downColor: "#38bdf8", borderVisible: false, wickUpColor: "#fb7185", wickDownColor: "#38bdf8", priceFormat: { type: "price", precision: 0, minMove: 1 } });
    candles.setData(selected.map(bar => ({ time: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    const volumes = chart.addHistogramSeries({ priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    volumes.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumes.setData(selected.map(bar => ({ time: bar.date, value: bar.volume, color: bar.close >= bar.open ? "#fb718550" : "#38bdf850" })));
    const byDate = new Map(selected.map(bar => [bar.date, bar]));
    chart.subscribeCrosshairMove(event => {
      const point = event.seriesData.get(candles) as CandlestickData | undefined;
      if (!event.time || !point || !("close" in point)) { setHover(null); return; }
      const time = event.time;
      const date = typeof time === "string" ? time : typeof time === "number" ? new Date(time * 1000).toISOString().slice(0, 10) : `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
      setHover(byDate.get(date) ?? null);
    });
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth })); observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [selected]);
  const detail = hover ?? selected.at(-1);
  return <section className="overflow-hidden rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-6" aria-label={`${name} 트레이딩뷰 주가 차트`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">{name} 주가 차트</h2><p className="mt-1 text-xs text-zinc-500">{code} · TradingView Lightweight Charts™ · KRX 15:30 정규장 종가</p></div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">트레이딩뷰에서 열기 ↗</a>
    </div>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs tabular-nums text-zinc-400">{detail ? `${detail.date} · 시 ${number(detail.open)} · 고 ${number(detail.high)} · 저 ${number(detail.low)} · 종 ${number(detail.close)}원 · 거래량 ${number(detail.volume)}` : error ? "일봉 데이터 없음" : "일봉을 불러오고 있습니다…"}</p>
      <div className="flex flex-wrap gap-1" aria-label="주가 차트 기간">{(Object.keys(ranges) as Range[]).map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)} className={`rounded-md px-2.5 py-1.5 text-xs ${range === value ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>{value === "ALL" ? "전체" : value}</button>)}</div>
    </div>
    {error && <p role="status" className="mb-4 text-xs text-amber-200">{error} {bars ? "기존 일봉을 유지합니다." : "트레이딩뷰 링크에서도 확인할 수 있습니다."}<button type="button" onClick={() => setAttempt(value => value + 1)} className="ml-3 rounded border border-white/15 px-2 py-1">다시 시도</button></p>}
    <div ref={host} className="h-[420px] w-full" />
    <p className="mt-4 text-[11px] text-zinc-500">차트: <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="text-sky-400">TradingView</a> · 시세: 네이버 · {selected.length}개 일봉{selected.length ? ` · ${selected[0].date} ~ ${selected.at(-1)!.date}` : ""}</p>
    <p className="mt-1 text-[11px] text-zinc-500">장중에는 직전 완료 거래일의 KRX 일봉을 표시합니다. NXT·시간외 종가는 포함하지 않습니다. QuantiWise 밸류에이션의 기준일은 별도입니다.</p>
    {bars && book && <p className="mt-1 text-[11px] text-zinc-500">기준일 {book.asOf} · 가격 기준 KRX 15:30 · 수집 {new Date(book.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} KST</p>}
  </section>;
}
