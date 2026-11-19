"use client";

import { useState } from "react";
import { formatSigned } from "@/lib/format";
import { marketLiveRotationWindows, type MarketLiveRadar, type MarketLiveRotationData, type MarketLiveRotationWindow } from "@/lib/market/market-live";

const kstClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

type RotationRow = MarketLiveRotationData["rows"][number];
const windowLabel: Record<MarketLiveRotationWindow, string> = { 10: "10분", 30: "30분", 60: "1시간" };

export function MarketLiveRotation({ radar, active }: { radar: MarketLiveRadar | null; active: boolean }) {
  const [minutes, setMinutes] = useState<MarketLiveRotationWindow>(10);
  const data = radar?.windows[minutes];
  const rows = data?.rows ?? [];
  const strengthening = rows.filter(row => row.changePp >= 0.005).sort((a, b) => b.changePp - a.changePp).slice(0, 4);
  const weakening = rows.filter(row => row.changePp <= -0.005).sort((a, b) => a.changePp - b.changePp).slice(0, 4);
  const scale = Math.max(0.01, ...rows.map(row => Math.abs(row.changePp)));

  return (
    <section aria-labelledby="market-live-rotation" className="min-w-0 rounded-xl border border-white/10 bg-[#151a22] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 id="market-live-rotation" className="font-semibold">섹터 순환매 레이더</h2>
          <p className="mt-1 text-xs text-zinc-400">같은 구성종목으로 비교한 섹터 등락률 변화</p>
        </div>
        <div className="flex gap-0.5 rounded-md border border-white/10 p-0.5" role="group" aria-label="섹터 순환매 비교 기간">
          {marketLiveRotationWindows.map(window => (
            <button
              key={window} type="button" aria-pressed={minutes === window} onClick={() => setMinutes(window)}
              className={`rounded px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-emerald-400 ${minutes === window ? "bg-emerald-400/15 font-semibold text-emerald-200" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {windowLabel[window]}
            </button>
          ))}
        </div>
      </div>
      {data && radar && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums text-zinc-400">
          <span>{radar.date} · {active && radar.live ? "장중 비교" : "마지막 비교"}</span>
          <span><time dateTime={data.from}>{kstClock.format(Date.parse(data.from))}</time> <span aria-hidden="true">→</span><span className="sr-only">부터 </span> <time dateTime={data.to}>{kstClock.format(Date.parse(data.to))}</time> KST</span>
          <span>비교 종가 {radar.baselineDate} KRX 15:30</span>
        </p>
      )}
      {!data ? (
        <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-xs leading-5 text-zinc-400">
          {active ? `${windowLabel[minutes]} 전의 섹터 기록과 비교할 수 있을 때 표시합니다.` : `저장된 ${windowLabel[minutes]} 비교 구간이 없습니다.`}
        </p>
      ) : (
        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          <RotationGroup title="강해진 섹터" rows={strengthening} scale={scale} />
          <RotationGroup title="약해진 섹터" rows={weakening} scale={scale} weakening />
        </div>
      )}
    </section>
  );
}

function RotationGroup({ title, rows, scale, weakening = false }: { title: string; rows: RotationRow[]; scale: number; weakening?: boolean }) {
  const text = weakening ? "text-sky-300" : "text-rose-300";
  const bar = weakening ? "bg-sky-400/70" : "bg-rose-400/70";

  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`text-xs font-semibold ${text}`}>{title}</h3>
        <span className="text-[11px] text-zinc-400">등락률 변화</span>
      </div>
      {rows.length ? (
        <ol className="mt-1 divide-y divide-white/[0.06]">
          {rows.map(row => {
            const previous = row.nowPct - row.changePp;
            const reversed = weakening ? previous >= 0.005 && row.nowPct <= -0.005 : previous <= -0.005 && row.nowPct >= 0.005;
            return (
              <li key={row.name} className="py-2 last:pb-1">
                <div className="flex items-baseline justify-between gap-x-3 text-xs">
                  <span className="min-w-0 break-words font-medium text-zinc-100">{row.name}</span>
                  <span className={`shrink-0 font-semibold tabular-nums ${text}`}>{formatSigned(row.changePp)}%p</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.abs(row.changePp) / scale * 100}%` }} />
                </div>
                <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] tabular-nums text-zinc-400">
                  <span>비교 시점 {formatSigned(Math.abs(row.nowPct) < 0.005 ? 0 : row.nowPct)}%</span>
                  <span>비교 {row.compared}/{row.total}종목</span>
                  {reversed && <span className={text}>{weakening ? "하락 전환" : "상승 전환"}</span>}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-3 text-xs text-zinc-400">{title}가 없습니다.</p>
      )}
    </div>
  );
}
