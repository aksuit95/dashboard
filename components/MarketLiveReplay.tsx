"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNumber, formatSigned } from "@/lib/format";
import { marketLiveChange, marketLiveSymbols, type MarketLiveIndex } from "@/lib/market/market-live";

const minute = 60_000;
const lookbacks = [5, 15] as const;
const names = { KOSPI: "코스피", KOSDAQ: "코스닥" };
const control = "rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50";
const kstClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

export function MarketLiveReplay({ indexes }: { indexes: MarketLiveIndex[] }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const { series, start, end } = useMemo(() => {
    const times: number[] = [];
    const series = marketLiveSymbols.map(symbol => {
      const prices = new Map<number, number>();
      for (const point of indexes.find(index => index.symbol === symbol)?.points ?? []) {
        const time = Date.parse(point.time);
        if (time % minute !== 0 || !Number.isFinite(point.value) || point.value <= 0) continue;
        prices.set(time, point.value);
        times.push(time);
      }
      return { symbol, prices };
    });
    return { series, start: times.length ? Math.min(...times) : null, end: times.length ? Math.max(...times) : null };
  }, [indexes]);
  const selected = cursor != null && start != null && end != null && cursor >= start && cursor < end ? cursor : end;

  useEffect(() => {
    if (!playing) return;
    if (selected == null || end == null || selected === end) {
      setPlaying(false);
      return;
    }
    const next = Math.min(selected + 5 * minute, end);
    const timer = window.setTimeout(() => {
      setCursor(next === end ? null : next);
      if (next === end) setPlaying(false);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [playing, selected, end]);

  function seek(time: number | null) {
    setPlaying(false);
    setCursor(time === end ? null : time);
  }

  function togglePlayback() {
    if (!playing && selected === end) setCursor(start);
    setPlaying(!playing);
  }

  const hasRange = start != null && end != null && start < end;
  return (
    <section aria-labelledby="market-live-replay" className="min-w-0 rounded-xl border border-white/10 bg-[#151a22] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div>
          <h2 id="market-live-replay" className="font-semibold">지수 장중 리플레이</h2>
          <p className="mt-1 text-xs text-zinc-400">KRX 정규장 1분봉 · 한국시간(KST)</p>
        </div>
        {selected != null && <div className="flex items-center gap-2">
          <button className={control} type="button" onClick={togglePlayback} disabled={!hasRange} title="1회에 5분씩 이동">{playing ? "일시정지" : "재생"}</button>
          <button className={control} type="button" onClick={() => seek(null)} disabled={selected === end}>최신으로</button>
        </div>}
      </div>
      {selected != null && start != null && end != null ? (
        <>
          <div className="mt-3.5 flex items-baseline justify-between gap-2 tabular-nums">
            <label htmlFor="market-live-replay-minute" className="text-xs text-zinc-400">선택 시각</label>
            <time dateTime={new Date(selected).toISOString()} className="text-sm font-semibold">{kstDate.format(selected)} {kstClock.format(selected)}</time>
          </div>
          <input
            id="market-live-replay-minute"
            type="range"
            min={0}
            max={(end - start) / minute}
            step={1}
            value={(selected - start) / minute}
            onChange={event => seek(start + event.currentTarget.valueAsNumber * minute)}
            aria-valuetext={`${kstDate.format(selected)} ${kstClock.format(selected)} 한국시간`}
            disabled={!hasRange}
            className="mt-1.5 block h-7 w-full cursor-pointer accent-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-default"
          />
          <div className="flex justify-between gap-2 text-xs tabular-nums text-zinc-400" aria-hidden="true">
            <span>{kstClock.format(start)}</span>
            {hasRange && <span>{kstClock.format(end)}</span>}
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:gap-3">
            {series.map(({ symbol, prices }) => {
              const price = prices.get(selected) ?? null;
              return (
                <article key={symbol} className="min-w-0 rounded-lg border border-white/10 bg-black/15 px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <h3 className="text-sm font-medium text-zinc-300">{names[symbol]}</h3>
                    <p className="text-lg font-semibold tabular-nums">{price == null ? "—" : formatNumber(price)}</p>
                  </div>
                  <dl className="mt-1.5 grid gap-y-1 text-xs tabular-nums sm:grid-cols-2 sm:gap-x-3">
                    {lookbacks.map(lookback => {
                      const baseTime = selected - lookback * minute;
                      const change = marketLiveChange(price, prices.get(baseTime));
                      const color = change == null || change === 0 ? "text-zinc-300" : change > 0 ? "text-rose-400" : "text-sky-400";
                      return (
                        <div key={lookback} className="flex flex-wrap items-baseline justify-between gap-x-2 sm:justify-start">
                          <dt className="text-zinc-400" title={`${kstClock.format(baseTime)} KST 분봉 대비`}>{lookback}분 변화</dt>
                          <dd className={`font-semibold ${color}`}>{change == null ? "—" : `${formatSigned(change)}%`}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </article>
              );
            })}
          </div>
          <p className="mt-2.5 text-xs text-zinc-400">선택 시각과 정확히 5분·15분 전의 분봉이 있을 때 변화율을 표시합니다.</p>
        </>
      ) : <p className="mt-3 text-sm text-zinc-400">이 거래일의 분봉을 받으면 시간대를 골라 볼 수 있습니다.</p>}
    </section>
  );
}
