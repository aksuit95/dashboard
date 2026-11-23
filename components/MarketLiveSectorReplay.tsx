"use client";

import { krxCloseTime } from "@/config/market-calendar";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarketLiveRotation } from "@/components/MarketLiveRotation";
import { MarketLiveRotationHeatmap } from "@/components/MarketLiveRotationHeatmap";
import { MarketLiveSectorStocks, MarketLiveSectorToggle } from "@/components/MarketLiveSectorStocks";
import { sectorNames } from "@/config/sectors";
import { formatSigned } from "@/lib/format";
import {
  MARKET_LIVE_SECTOR_REFRESH_SECONDS, marketLiveFrameTime, marketLiveReplaySectorStocks, summarizeMarketLiveHourlyLeaders,
  type MarketLiveArchiveResponse, type MarketLiveHourlyLeader, type MarketLiveSectorResponse,
} from "@/lib/market/market-live-archive";
import { marketLiveTradingWindow } from "@/lib/market/market-live-session";

type ArchiveDay = NonNullable<MarketLiveArchiveResponse["day"]>;
type Frame = ArchiveDay["frames"][number];
type SectorRank = Frame["sectors"][number] & { changePct: number };
type Slot = { time: number; frame: Frame; ranks: SectorRank[] };
type Lead = { name: string; start: number; end: number };

const minute = 60_000;
const control = "rounded-md border border-white/10 bg-[#151a22] px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50";
const minuteClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const secondClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const sectorPalette = [
  "#fbbf24", "#fb7185", "#38bdf8", "#a78bfa", "#2dd4bf", "#fdba74", "#f472b6", "#84cc16", "#67e8f9", "#c084fc",
  "#facc15", "#34d399", "#818cf8", "#fda4af", "#22d3ee", "#bef264", "#e879f9", "#fb923c", "#60a5fa", "#a3a3a3",
];
const sectorColors = new Map<string, string>(sectorNames.map((name, index) => [name, sectorPalette[index]]));
const sectorColor = (name: string) => sectorColors.get(name) ?? "#a3a3a3";

function snapshotTime(value: string | null) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? secondClock.format(time) : "—";
}

function useArchive(date: string | null, refresh: number, live: boolean, closed = false) {
  const [archive, setArchive] = useState<MarketLiveSectorResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const reload = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (date === null) return;
    let mounted = true;
    let pending: AbortController | null = null;
    const url = date ? `/api/market-live/archive?date=${encodeURIComponent(date)}` : "/api/market-live/archive";
    async function load() {
      if (!mounted || pending) return;
      const controller = new AbortController();
      pending = controller;
      setBusy(true);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value: MarketLiveSectorResponse = await response.json();
        if (!Array.isArray(value?.dates) || (value.day !== null && !Array.isArray(value.day?.frames))) throw new Error("기록 형식 오류");
        if (mounted) {
          setArchive(previous => !date && value.warning && previous?.day &&
            previous.day.date > (value.day?.date ?? "") ? { ...previous, warning: value.warning } : value);
          setFailed(false);
        }
      } catch {
        if (mounted) setFailed(true);
      } finally {
        pending = null;
        if (mounted) setBusy(false);
      }
    }
    reload.current = () => {
      if (!document.hidden) void load();
    };
    if (!document.hidden) void load();
    return () => {
      mounted = false;
      pending?.abort();
      reload.current = () => undefined;
    };
  }, [date, refresh]);
  const waitingForClose = closed && !archive?.radar?.closeAt;
  useEffect(() => {
    if (date === null) return;
    const loadVisible = () => reload.current();
    const timer = live || waitingForClose ? window.setInterval(loadVisible, minute) : undefined;
    document.addEventListener("visibilitychange", loadVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", loadVisible);
    };
  }, [date, live, waitingForClose]);
  const previousLive = useRef(live);
  useEffect(() => {
    const changed = previousLive.current !== live;
    previousLive.current = live;
    if (!changed) return;
    reload.current();
    if (live) return;
    const afterClose = window.setTimeout(() => reload.current(), MARKET_LIVE_SECTOR_REFRESH_SECONDS * 1000);
    return () => window.clearTimeout(afterClose);
  }, [live]);
  return { archive, busy, failed };
}

function buildTimeline(day: ArchiveDay | null) {
  const byMinute = new Map<number, Slot>();
  for (const frame of day?.frames ?? []) {
    const at = Date.parse(marketLiveFrameTime(frame));
    if (!Number.isFinite(at)) continue;
    const time = Math.floor(at / minute) * minute;
    const saved = byMinute.get(time);
    if (saved && Date.parse(saved.frame.collectedAt) >= Date.parse(frame.collectedAt)) continue;
    const ranks = frame.sectors
      .filter((row): row is SectorRank => row.changePct != null && Number.isFinite(row.changePct) && row.compared > 0)
      .sort((a, b) => b.changePct - a.changePct || a.name.localeCompare(b.name, "ko-KR"));
    byMinute.set(time, { time, frame, ranks });
  }
  const slots = [...byMinute.values()].sort((a, b) => a.time - b.time);
  const first = slots[0]?.time;
  const latest = slots.at(-1)?.time;
  if (!day || first == null || latest == null) return null;

  const schedule = marketLiveTradingWindow(day.date);
  const start = Math.min(first, schedule?.openAt ?? first);
  const end = Math.max(latest, schedule?.closeAt ?? latest);
  const leads: Lead[] = [];
  for (const slot of slots) {
    const leader = slot.ranks[0];
    if (!leader) continue;
    const last = leads.at(-1);
    if (last?.name === leader.name && last.end + minute === slot.time) last.end = slot.time;
    else leads.push({ name: leader.name, start: slot.time, end: slot.time });
  }
  const hourlyCloseAt = schedule?.closeAt ?? latest + minute;
  const hourlyLeaders = summarizeMarketLiveHourlyLeaders(
    slots.map(({ time, ranks }) => ({ time, name: ranks[0]?.name })),
    schedule?.openAt ?? first, hourlyCloseAt,
  );
  return { slots, byMinute, leads, hourlyLeaders, hourlyCloseAt, start, end, latest };
}

export function MarketLiveSectorPanels({ live = false, closed = false }: { live?: boolean; closed?: boolean }) {
  const [date, setDate] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const latest = useArchive("", refresh, live, closed);
  const useLatest = !date || date === latest.archive?.day?.date;
  const history = useArchive(useLatest ? null : date, refresh, false);
  const { archive, busy, failed } = useLatest ? latest : history;
  const day = archive?.day && (!date || archive.day.date === date) ? archive.day : null;
  const timeline = useMemo(() => buildTimeline(day), [day]);
  const selected = timeline && cursor != null && cursor >= timeline.start && cursor <= timeline.end ? cursor : timeline?.latest;

  useEffect(() => {
    if (!playing || !timeline || selected == null) return;
    const next = timeline.slots.find(slot => slot.time > selected);
    if (!next) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setCursor(next.time), 350);
    return () => window.clearTimeout(timer);
  }, [playing, selected, timeline]);

  function seek(time: number | null) {
    setPlaying(false);
    setCursor(time === timeline?.latest ? null : time);
  }

  function togglePlayback() {
    if (!timeline) return;
    if (!playing && selected != null && selected >= timeline.latest) setCursor(timeline.slots[0].time);
    setPlaying(!playing);
  }

  const slot = selected == null ? null : timeline?.byMinute.get(selected);
  const warning = latest.failed ? "섹터 데이터를 갱신하지 못했습니다." : latest.archive?.warning;
  const radar = latest.archive?.radar;
  return (
    <>
    {warning && <p className="text-xs text-amber-200" role="status">{warning}</p>}
    <MarketLiveRotation radar={closed && !radar?.closeAt ? null : radar ?? null} active={live && !latest.failed} closed={closed} />
    <section aria-labelledby="market-live-sector-replay" className="min-w-0 rounded-xl border border-white/10 bg-[#151a22] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="market-live-sector-replay" className="font-semibold">섹터 장중 리플레이</h2>
          <p className="mt-1 text-xs text-zinc-400">KRX 정규장 · 코스피200·코스닥150 · 한국시간(KST)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="market-live-sector-date" className="sr-only">섹터 리플레이 거래일</label>
          <select
            id="market-live-sector-date"
            value={date}
            className={control}
            onChange={event => {
              seek(null);
              setDate(event.currentTarget.value);
            }}
          >
            <option value="">최신 기록</option>
            {latest.archive?.dates.map(day => <option value={day} key={day}>{day}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)} className={control}>기록 새로고침</button>
        </div>
      </div>
      {!useLatest && failed && <p className="mt-3 text-xs text-amber-200" role="status">저장된 섹터 기록을 갱신하지 못했습니다.</p>}
      {!day || !timeline || selected == null ? (
        <p className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-xs text-zinc-400">
          {busy ? "섹터 흐름을 불러오는 중입니다." : "이 거래일의 섹터 기록이 없습니다."}
        </p>
      ) : (
        <>
          <MarketLiveRotationHeatmap key={day.date} day={day} />
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs tabular-nums text-zinc-400">
              <span className="font-semibold text-zinc-200">{day.date}</span>
              <span className="ml-2.5">비교 종가 {day.baselineDate} KRX {krxCloseTime(day.baselineDate)}</span>
              <span className="ml-2.5">기록 {timeline.slots.length}분</span>
              {archive?.coverage && <span className="ml-2.5">분봉 비교 가능 {archive.coverage.compared}/{archive.coverage.total}종목</span>}
            </div>
            <div className="flex gap-2">
              <button type="button" className={control} onClick={togglePlayback} disabled={timeline.slots.length < 2}>{playing ? "일시정지" : "섹터 재생"}</button>
              <button type="button" className={control} onClick={() => seek(null)} disabled={selected === timeline.latest}>마지막 기록</button>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <label htmlFor="market-live-sector-minute" className="text-xs text-zinc-400">리플레이 시각</label>
            <time className="text-sm font-semibold tabular-nums" dateTime={new Date(selected).toISOString()}>{minuteClock.format(selected)} KST</time>
          </div>
          <TimelineTrack timeline={timeline} selected={selected} seek={seek} />
          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            <SectorRanks key={day.date} slot={slot ?? null} day={day} />
            <LeadHistory hours={timeline.hourlyLeaders} selected={selected} closeAt={timeline.hourlyCloseAt} seek={seek} />
          </div>
        </>
      )}
    </section>
    </>
  );
}

function TimelineTrack({ timeline, selected, seek }: { timeline: NonNullable<ReturnType<typeof buildTimeline>>; selected: number; seek: (time: number) => void }) {
  const { start, end } = timeline;
  const width = end - start + minute;
  return (
    <>
      <div className="relative mt-2 h-2.5 overflow-hidden rounded bg-white/[0.07]" aria-hidden="true">
        {timeline.leads.map(lead => (
          <span
            key={lead.start}
            className="absolute inset-y-0"
            style={{ backgroundColor: sectorColor(lead.name), left: `${(lead.start - start) / width * 100}%`, width: `${(lead.end - lead.start + minute) / width * 100}%` }}
          />
        ))}
        <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" style={{ left: `${(selected - start + minute / 2) / width * 100}%` }} />
      </div>
      <input
        id="market-live-sector-minute"
        className="block h-6 w-full cursor-pointer accent-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-default"
        type="range"
        min={0}
        max={(end - start) / minute}
        step={1}
        value={(selected - start) / minute}
        aria-valuetext={`${minuteClock.format(selected)} 한국시간${timeline.byMinute.has(selected) ? "" : ", 기록 없음"}`}
        onChange={event => seek(start + event.currentTarget.valueAsNumber * minute)}
        disabled={start === end}
      />
      <div className="flex justify-between text-[11px] tabular-nums text-zinc-400" aria-hidden="true">
        <span>{minuteClock.format(start)}</span><span>{minuteClock.format(end)}</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">색은 등락률 1위 섹터, 회색 구간은 순위를 확인할 기록이 없는 시각입니다.</p>
    </>
  );
}

function SectorRanks({ slot, day }: { slot: Slot | null; day: ArchiveDay }) {
  const [selected, setSelected] = useState<string | null>(null);
  const stocks = selected && slot && day.stockTape ? marketLiveReplaySectorStocks(day.stockTape, slot.time, selected) : [];
  const toggle = (name: string) => setSelected(current => current === name ? null : name);
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-white/[0.07] bg-black/15">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5">
        <h3 className="text-sm font-semibold">선택 시각 섹터 순위</h3>
        {slot && <span className="text-xs tabular-nums text-zinc-400">수집 {snapshotTime(slot.frame.collectedAt)}</span>}
      </div>
      {slot?.ranks.length ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-[#171d26] text-zinc-400">
              <tr>
                <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">섹터</th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">등락률</th>
                <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">비교/전체</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">시세 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {slot.ranks.map((sector, index) => (
                <tr className={`cursor-pointer hover:bg-white/[0.06] ${index === 0 ? "bg-white/[0.04]" : ""}`}
                  key={sector.name} onClick={() => toggle(sector.name)}>
                  <th scope="row" className="px-3 py-2 font-medium">
                    <span className="mr-1.5 text-zinc-500">{index + 1}</span>
                    <MarketLiveSectorToggle name={sector.name} expanded={selected === sector.name}
                      controls="market-live-replay-sector-stocks" onToggle={() => toggle(sector.name)} />
                  </th>
                  <td className={`whitespace-nowrap px-2 py-2 text-right font-semibold ${sector.changePct > 0 ? "text-rose-400" : sector.changePct < 0 ? "text-sky-400" : "text-zinc-300"}`}>
                    {formatSigned(Math.abs(sector.changePct) < 0.005 ? 0 : sector.changePct)}%
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-zinc-300" title="비교 가능 / 전체 구성종목">{sector.compared}/{sector.total}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-400">{snapshotTime(sector.asOf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-3 pb-3 text-xs text-zinc-400">선택한 분의 섹터 순위를 확인할 기록이 없습니다.</p>}
      {selected && <div className="border-t border-white/[0.07] p-2.5">
        <MarketLiveSectorStocks id="market-live-replay-sector-stocks" name={selected} stocks={stocks}
          priceLabel="기록 가격" selectedTime={slot ? `${minuteClock.format(slot.time)} KST 기록` : undefined}
          status="선택한 시각의 종목별 기록이 없습니다." />
      </div>}
    </div>
  );
}

function LeadHistory({ hours, selected, closeAt, seek }: {
  hours: MarketLiveHourlyLeader[]; selected: number; closeAt: number; seek: (time: number) => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.07] bg-black/15">
      <div className="px-3 py-2.5">
        <h3 className="text-sm font-semibold">시간대별 1위 섹터</h3>
        <p className="mt-0.5 text-[11px] text-zinc-400">구간 내 누적 1위 시간 기준 · 동률이면 가장 최근 1위</p>
      </div>
      {hours.length ? (
        <ol className="max-h-64 overflow-auto border-t border-white/[0.06] px-1.5">
          {hours.map(({ start, end, observed, lead }) => {
            const current = selected >= start && (selected < end || (selected === end && end === closeAt));
            const interval = `${minuteClock.format(start)}–${minuteClock.format(end)}`;
            return (
              <li key={start} className="border-b border-white/[0.06] last:border-b-0">
                {lead ? (
                  <button
                    type="button"
                    className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-2 text-left text-xs hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-emerald-400 ${current ? "bg-white/[0.07]" : ""}`}
                    onClick={() => seek(lead.firstAt)}
                    aria-current={current ? "time" : undefined}
                  >
                    <span className="shrink-0 tabular-nums text-zinc-400">{interval}</span>
                    <span className="min-w-0 break-words text-zinc-200"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: sectorColor(lead.name) }} aria-hidden="true" />{lead.name}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-zinc-400">1위 {lead.minutes}/{observed}분</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 py-2 text-xs text-zinc-400">
                    <span className="tabular-nums">{interval}</span><span>기록 없음</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : <p className="px-3 pb-3 text-xs text-zinc-400">표시할 1위 섹터가 없습니다.</p>}
    </div>
  );
}
