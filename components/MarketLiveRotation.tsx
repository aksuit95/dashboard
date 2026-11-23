"use client";

import { krxCloseTime } from "@/config/market-calendar";
import { useState } from "react";
import { formatSigned } from "@/lib/format";
import { marketLiveRotationWindows, type MarketLiveRadar, type MarketLiveRotationData, type MarketLiveRotationWindow } from "@/lib/market/market-live";

const kstClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

type RotationRow = MarketLiveRotationData["rows"][number];
const windowLabel: Record<MarketLiveRotationWindow, string> = { 10: "10분", 30: "30분", 60: "1시간" };

export function MarketLiveRotation({ radar, active, closed }: { radar: MarketLiveRadar | null; active: boolean; closed: boolean }) {
  const [sort, setSort] = useState<{ minutes: MarketLiveRotationWindow; ascending: boolean } | null>(null);
  const periods = marketLiveRotationWindows.map(minutes => {
    const comparison = radar?.windows[minutes];
    return { minutes, comparison, rows: new Map(comparison?.rows.map(row => [row.name, row])) };
  });
  const sortPeriod = periods.find(period => period.minutes === sort?.minutes && period.comparison) ??
    periods.find(period => period.comparison);
  const ascending = sort?.minutes === sortPeriod?.minutes && sort?.ascending;
  const names = [...new Set(periods.flatMap(period => [...period.rows.keys()]))];
  names.sort((a, b) => {
    const first = sortPeriod?.rows.get(a)?.changePp;
    const second = sortPeriod?.rows.get(b)?.changePp;
    if (first == null || second == null) return Number(first == null) - Number(second == null) || a.localeCompare(b, "ko");
    return (ascending ? first - second : second - first) || a.localeCompare(b, "ko");
  });

  return (
    <section aria-labelledby="market-live-rotation" className="min-w-0 rounded-xl border border-white/10 bg-[#151a22] px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 id="market-live-rotation" className="font-semibold">섹터 순환매 레이더</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">등락률 변화폭(%p) · 상승 확산도는 양쪽 시점에서 비교한 종목 중 오른 종목의 비율</p>
        </div>
        {radar && (
          <div className="text-xs leading-5 text-zinc-400">
            <p className="tabular-nums">{radar.date} · {radar.closeAt ? "KRX 정규장 종가 기준" : active && radar.live ? "KRX 장중 비교" : "KRX 마지막 비교"}</p>
            <p className="tabular-nums">비교 종가 {radar.baselineDate} KRX {krxCloseTime(radar.baselineDate)} KST</p>
          </div>
        )}
      </div>
      {names.length ? (
        <div className="mt-3 max-h-88 overflow-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[27rem] text-left text-xs tabular-nums">
            <thead className="sticky top-0 z-10 bg-[#1b212b] text-zinc-300">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">섹터</th>
                {periods.map(({ minutes, comparison }) => (
                  <th key={minutes} scope="col" className="w-[26%] px-2 py-1.5 text-right font-medium"
                    aria-sort={sortPeriod?.minutes === minutes ? ascending ? "ascending" : "descending" : undefined}>
                    <button type="button" disabled={!comparison} aria-label={windowLabel[minutes] + " 등락률 변화폭으로 정렬"}
                      className="rounded px-1 py-0.5 font-semibold enabled:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:text-zinc-500"
                      onClick={() => setSort({ minutes, ascending: sortPeriod?.minutes === minutes && !ascending })}>
                      {windowLabel[minutes]} {sortPeriod?.minutes === minutes && <span aria-hidden="true">{ascending ? "↑" : "↓"}</span>}
                    </button>
                    <span className="block whitespace-nowrap text-[10px] font-normal text-zinc-400">
                      {comparison ? <><time dateTime={comparison.from}>{kstClock.format(Date.parse(comparison.from))}</time>–<time dateTime={comparison.to}>{kstClock.format(Date.parse(comparison.to))}</time></> : "기록 부족"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {names.map(name => (
                <tr key={name}>
                  <th scope="row" className="px-3 py-2 font-medium text-zinc-100">{name}</th>
                  {periods.map(({ minutes, rows }) => (
                    <td key={minutes} className="px-2 py-1.5 text-right"><RotationCell row={rows.get(name)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-xs leading-5 text-zinc-400">
          {closed && !radar?.closeAt ? "확인된 정규장 종가 비교를 기다리는 중입니다." : "10분·30분·1시간 전과 비교할 수 있는 섹터 기록이 쌓이면 표시합니다."}
        </p>
      )}
    </section>
  );
}

function RotationCell({ row }: { row: RotationRow | undefined }) {
  if (!row) return <span className="text-zinc-500" aria-label="비교 기록 없음">—</span>;
  const change = Math.abs(row.changePp) < 0.005 ? 0 : row.changePp;
  const current = Math.abs(row.nowPct) < 0.005 ? 0 : row.nowPct;
  const previous = row.nowPct - row.changePp;
  const reversal = current > 0 && previous <= -0.005 ? " · 상승 전환" : current < 0 && previous >= 0.005 ? " · 하락 전환" : "";
  return (
    <>
      <span title={"비교 시점 등락률 " + formatSigned(current) + "%" + reversal}
        className={change > 0 ? "font-semibold text-rose-300" : change < 0 ? "font-semibold text-sky-300" : "font-semibold text-zinc-300"}>
        {formatSigned(change)}%p
      </span>
      <span className="block whitespace-nowrap text-[11px] text-zinc-400" title={"비교 가능 " + row.compared + "/" + row.total + "종목"}>
        {row.up == null ? "상승 기록 없음" : "상승 " + row.up + "/" + row.compared + "종목"}
      </span>
    </>
  );
}
