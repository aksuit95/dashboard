"use client";

import { ColorType, createChart, type IChartApi, type ISeriesApi, type LineData } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { sliceByRange, type RangeKey } from "@/lib/market/series";

const ranges: RangeKey[] = ["6M", "1Y", "3Y", "5Y"];

export function RangeChart({
  points,
  color = "#e11d48",
  digits = 2,
}: {
  points: { date: string; value: number }[];
  color?: string;
  digits?: number;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const sliced = useMemo(() => sliceByRange(points, range), [points, range]);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const chart: IChartApi = createChart(element, {
      height: 220,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#27272a" }, horzLines: { color: "#27272a" } },
      rightPriceScale: { borderColor: "#27272a" },
      timeScale: { borderColor: "#27272a" },
    });
    const series: ISeriesApi<"Line"> = chart.addLineSeries({ color, lineWidth: 2, priceFormat: { type: "price", precision: digits, minMove: 0.01 } });
    const data: LineData[] = sliced.map((point) => ({ time: point.date, value: point.value }));
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
  }, [sliced, color, digits]);

  return (
    <div>
      <div className="mb-2 flex gap-1">
        {ranges.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setRange(item)}
            className={`rounded px-2 py-1 text-xs ${range === item ? "bg-white/15 text-white" : "text-zinc-500"}`}
          >
            {item}
          </button>
        ))}
      </div>
      {sliced.length ? <div ref={host} className="w-full" /> : <p className="text-sm text-zinc-500">이 구간의 데이터가 없습니다.</p>}
    </div>
  );
}
