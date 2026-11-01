"use client";

import { ColorType, createChart, type CandlestickData, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/sources/proxy-board";

export function CandleChart({ candles, digits }: { candles: Candle[]; digits: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element || !candles.length) return;
    const chart: IChartApi = createChart(element, {
      height: 280,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#27272a" }, horzLines: { color: "#27272a" } },
      rightPriceScale: { borderColor: "#27272a" },
      timeScale: { borderColor: "#27272a", timeVisible: true, secondsVisible: false },
    });
    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#fb7185",
      downColor: "#38bdf8",
      borderVisible: false,
      wickUpColor: "#fb7185",
      wickDownColor: "#38bdf8",
      priceFormat: { type: "price", precision: digits, minMove: digits === 0 ? 1 : 0.01 },
    });
    const data: CandlestickData[] = candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    series.setData(data);
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: element.clientWidth });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, digits]);

  return <div ref={host} className="w-full" />;
}
