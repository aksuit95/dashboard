"use client";

import { useMemo, useState } from "react";
import { MarketLiveSectorStocks } from "@/components/MarketLiveSectorStocks";
import { formatSigned } from "@/lib/format";
import {
  buildMarketLiveHeatmap, marketLiveIntervalStocks, type MarketLiveHeatmapDay, type MarketLiveHeatmapInterval,
} from "@/lib/market/market-live-heatmap";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const number = (value: number, unit: string) => formatSigned(Math.abs(value) < 0.005 ? 0 : value) + unit;
const tone = (value: number) => value >= 0.005 ? "text-rose-200" : value <= -0.005 ? "text-sky-200" : "text-zinc-300";
const intervalLabel = (interval: MarketLiveHeatmapInterval) => clock.format(interval.start) + "–" + clock.format(interval.end);

function cellColor(value: number | null) {
  if (value == null || Math.abs(value) < 0.005) return undefined;
  const color = value > 0 ? "244 63 94" : "14 165 233";
  return "rgb(" + color + " / " + (0.11 + Math.min(Math.abs(value) / 1.5, 1) * 0.34) + ")";
}

export function MarketLiveRotationHeatmap({ day }: { day: MarketLiveHeatmapDay }) {
  const heatmap = useMemo(() => buildMarketLiveHeatmap(day), [day]);
  const [selection, setSelection] = useState<{ start: number; sector: string } | null>(null);
  const interval = heatmap?.intervals.find(column => column.start === selection?.start);
  const sector = selection?.sector;
  const stocks = useMemo(() => day.stockTape && interval && sector
    ? marketLiveIntervalStocks(day.stockTape, interval, sector) : [], [day.stockTape, interval, sector]);

  return (
    <div className="mt-4 min-w-0 border-t border-white/[0.08] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-sm font-semibold">장중 순환매 히트맵</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            섹터 수익률 − 비교 가능 종목의 동일가중 평균(%p) · 칸을 누르면 해당 10분 구간의 순위와 종목을 볼 수 있습니다.
          </p>
        </div>
        {heatmap && (
          <p className="text-xs tabular-nums text-zinc-400">
            {day.date} · {heatmap.through === heatmap.closeAt
              ? "KRX 정규장 종가 " + clock.format(heatmap.closeAt)
              : "KRX 기록 " + clock.format(heatmap.through) + "까지"} KST
          </p>
        )}
      </div>
      {heatmap?.intervals.length ? (
        <>
          <div className="mb-2 mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
            <span className="text-rose-200">시장보다 강함</span>
            <span className="text-sky-200">시장보다 약함</span>
            <span>— 표본 부족</span>
            {heatmap.intervals.at(-1)?.end !== heatmap.intervals.at(-1)?.scheduledEnd && <span>* 기록 시각까지 비교</span>}
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-white/10">
            <table aria-label="10분 구간별 섹터 시장 대비 수익률" className="w-max min-w-full border-separate border-spacing-0 text-xs tabular-nums">
              <thead className="sticky top-0 z-20 bg-[#1b212b] text-zinc-300">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 border-b border-white/10 bg-[#1b212b] px-3 py-2 text-left font-medium">섹터</th>
                  {heatmap.intervals.map(column => (
                    <th key={column.start} scope="col" className="min-w-13 whitespace-nowrap border-b border-white/10 px-1 py-2 text-center font-medium"
                      aria-label={intervalLabel(column)} title={intervalLabel(column)}>
                      {clock.format(column.start)}{column.end < column.scheduledEnd ? "*" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.names.map(name => (
                  <tr key={name}>
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-white/[0.06] bg-[#1b212b] px-3 py-1 text-left font-medium text-zinc-200">{name}</th>
                    {heatmap.intervals.map(column => {
                      const value = column.sectors.get(name)?.relativePp ?? null;
                      const selected = interval?.start === column.start && sector === name;
                      const label = name + " " + intervalLabel(column) + " 시장 대비 " + (value == null ? "표본 부족" : number(value, "%p"));
                      return (
                        <td key={column.start} className="p-px">
                          <button type="button" aria-pressed={selected} aria-label={label} aria-controls={selected ? "market-live-interval-detail" : undefined}
                            title={label} onClick={() => setSelection({ start: column.start, sector: name })}
                            className={"block min-h-7 w-full rounded px-1 text-center text-[11px] font-medium hover:ring-1 hover:ring-inset hover:ring-white/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300 " +
                              (value == null ? "bg-white/[0.025] text-zinc-500 " : tone(value) + " ") +
                              (selected ? "ring-2 ring-inset ring-emerald-300" : "")}
                            style={{ backgroundColor: cellColor(value) }}>
                            {value == null ? "—" : number(value, "")}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {interval && sector && <IntervalDetail interval={interval} sector={sector} stocks={stocks}
            onSector={name => setSelection({ start: interval.start, sector: name })} />}
        </>
      ) : (
        <p className="mt-2 text-xs text-zinc-400">구간을 비교할 수 있는 종목 기록이 쌓이면 표시합니다.</p>
      )}
    </div>
  );
}

function IntervalDetail({ interval, sector, stocks, onSector }: {
  interval: MarketLiveHeatmapInterval;
  sector: string;
  stocks: ReturnType<typeof marketLiveIntervalStocks>;
  onSector: (sector: string) => void;
}) {
  const ranked = [...interval.sectors.values()]
    .filter((row): row is typeof row & { relativePp: number; changePct: number } => row.relativePp != null && row.changePct != null)
    .sort((a, b) => b.relativePp - a.relativePp || a.name.localeCompare(b.name, "ko"));
  const move = interval.sectors.get(sector);
  return (
    <section id="market-live-interval-detail" aria-labelledby="market-live-interval-title" className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 id="market-live-interval-title" className="text-xs font-semibold tabular-nums">{intervalLabel(interval)} KST 구간 섹터 순위</h4>
        {interval.marketPct != null && <p className="text-xs tabular-nums text-zinc-400">시장 평균 {number(interval.marketPct, "%")}</p>}
      </div>
      <div className="mt-2 grid items-start gap-3 xl:grid-cols-2">
        {ranked.length ? (
          <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="sticky top-0 bg-[#1b212b] text-zinc-400">
                <tr>
                  <th scope="col" className="px-2 py-2 font-medium">순위</th>
                  <th scope="col" className="px-2 py-2 font-medium">섹터</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">구간 수익률</th>
                  <th scope="col" aria-sort="descending" className="whitespace-nowrap px-2 py-2 text-right font-medium">시장 대비</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">상승 확산도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {ranked.map((row, index) => (
                  <tr key={row.name} className={row.name === sector ? "bg-emerald-400/10" : undefined}>
                    <td className="px-2 py-1.5 text-zinc-400">{index + 1}</td>
                    <th scope="row" className="px-2 py-1.5">
                      <button type="button" aria-pressed={row.name === sector} aria-controls="market-live-interval-stocks" onClick={() => onSector(row.name)}
                        className="rounded text-left text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-300">{row.name}</button>
                    </th>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right text-zinc-200">{number(row.changePct, "%")}</td>
                    <td className={"whitespace-nowrap px-2 py-1.5 text-right font-medium " + tone(row.relativePp)}>{number(row.relativePp, "%p")}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right text-zinc-300" title={"비교 가능 " + row.compared + "/" + row.total + "종목"}>{row.up}/{row.compared}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-xs text-zinc-400">이 구간에 순위를 매길 수 있는 표본이 없습니다.</p>}
        <MarketLiveSectorStocks id="market-live-interval-stocks" name={sector} stocks={stocks}
          selectedTime={move ? "비교 가능 " + move.compared + "/" + move.total + "종목" : undefined}
          priceLabel="구간 종료가" changeLabel="구간 등락률" />
      </div>
    </section>
  );
}
