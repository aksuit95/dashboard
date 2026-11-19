"use client";

import { krxCloseTime } from "@/config/market-calendar";
import { ColorType, createChart, type AreaData, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { MarketLiveSectorPanels } from "@/components/MarketLiveSectorReplay";
import { formatCompact, formatNumber, formatSigned } from "@/lib/format";
import {
  MARKET_LIVE_POLL_MS,
  marketLiveSymbols,
  type MarketLiveBoardData,
  type MarketLiveIndex,
  type MarketLiveResponse,
  type MarketLiveSector,
  type MarketLiveStock,
} from "@/lib/market/market-live";

const panel = "min-w-0 rounded-xl border border-white/10 bg-[#151a22]";
const action = "rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50";
const columnHeader = "whitespace-nowrap px-3 py-2.5 font-medium";
const kstClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const kstDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});
const indexNames = { KOSPI: "코스피", KOSDAQ: "코스닥" } as const;
const stateLabels: Record<MarketLiveBoardData["state"], { text: string; style: string }> = {
  open: { text: "정규장 운영 중", style: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" },
  auction: { text: "종가 동시호가", style: "border-amber-400/25 bg-amber-400/10 text-amber-200" },
  closed: { text: "정규장 대기", style: "border-white/10 bg-white/5 text-zinc-300" },
  unconfirmed: { text: "장 운영시간 확인 필요", style: "border-amber-400/25 bg-amber-400/10 text-amber-200" },
};

function clock(iso: string | null): string {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? kstClock.format(time) : "—";
}

function timestamp(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? `${kstDate.format(time)} ${kstClock.format(time)}` : "—";
}

function direction(value: number | null) {
  if (value == null || value === 0) return "text-zinc-300";
  return value > 0 ? "text-rose-400" : "text-sky-400";
}

function percent(value: number | null): string {
  return value == null ? "—" : `${formatSigned(value)}%`;
}

function useMarketLiveBoard() {
  const [board, setBoard] = useState<MarketLiveResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const refresh = useRef<() => void>(() => undefined);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let pending: AbortController | null = null;
    let delay = MARKET_LIVE_POLL_MS;

    async function load() {
      window.clearTimeout(timer);
      if (!active || document.hidden || pending) return;
      const controller = new AbortController();
      pending = controller;
      setRefreshing(true);
      try {
        const response = await fetch("/api/market-live", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value: MarketLiveResponse = await response.json();
        if (!active) return;
        setBoard(value);
        setFailed(false);
        delay = value.state === "open" || value.state === "auction" ? MARKET_LIVE_POLL_MS : 60_000;
      } catch {
        if (active) setFailed(true);
      } finally {
        pending = null;
        if (active) {
          setRefreshing(false);
          if (!document.hidden) timer = window.setTimeout(load, delay);
        }
      }
    }

    function onVisibility() {
      if (document.hidden) window.clearTimeout(timer);
      else void load();
    }

    refresh.current = () => void load();
    document.addEventListener("visibilitychange", onVisibility);
    void load();
    return () => {
      active = false;
      window.clearTimeout(timer);
      pending?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      refresh.current = () => undefined;
    };
  }, []);

  return { board, failed, refreshing, refresh: () => refresh.current() };
}

export function MarketLiveBoard() {
  const { board, failed, refreshing, refresh } = useMarketLiveBoard();
  const status = failed
    ? { text: "갱신 실패", style: "border-amber-400/25 bg-amber-400/10 text-amber-200" }
    : board ? stateLabels[board.state] : { text: "장 상태 확인 중", style: "border-white/10 bg-white/5 text-zinc-300" };
  const closed = board?.state === "closed";
  const statusText = !failed && closed ? board.note ?? status.text : status.text;

  return (
    <div className="space-y-5">
      <section className={`${panel} px-4 py-3`} aria-label="거래 및 수신 상태">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.style}`} aria-live="polite">
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{statusText}
            </span>
            <span className="text-xs text-zinc-400">KRX 정규장 · 네이버페이 증권 / KRX Open API · 한국시간(KST)</span>
          </div>
          <button type="button" className={action} onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
            {refreshing ? "갱신 중" : "새로고침"}
          </button>
        </div>
        {board && (
          <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums">
            <div className="flex gap-1.5"><dt className="text-zinc-400">시세 기준일</dt><dd>{board.date}</dd></div>
            <div className="flex gap-1.5"><dt className="text-zinc-400">비교 종가</dt><dd>{board.baselineDate ? `${board.baselineDate} KRX ${krxCloseTime(board.baselineDate)}` : "직전 거래일 KRX 정규장 종가 미확인"}</dd></div>
            <div className="flex gap-1.5"><dt className="text-zinc-400">수집 시각</dt><dd>{timestamp(board.collectedAt)}</dd></div>
          </dl>
        )}
        {failed && <p className="mt-2 text-xs text-amber-200" role="status">{board ? "시세를 갱신하지 못해 이전 수신 자료를 표시합니다." : "시세를 불러오지 못했습니다. 새로고침으로 다시 조회할 수 있습니다."}</p>}
        {board?.note && (failed || !closed) && <p className="mt-2 text-xs text-zinc-300">{board.note}</p>}
        {!!board?.warnings.length && <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-200">{board.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      </section>

      <section aria-label="코스피·코스닥 장중 지수" className="grid gap-4 sm:grid-cols-2">
        {marketLiveSymbols.map((symbol) => (
          <IndexCard key={symbol} symbol={symbol} index={board?.indexes.find((item) => item.symbol === symbol)} loading={!board && refreshing} />
        ))}
      </section>

      <BreadthPanel breadth={board?.breadth} />
      <MarketLiveSectorPanels live={board?.state === "open" || board?.state === "auction"} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <SectorPanel sectors={board?.sectors ?? []} />
        <LeaderPanel leaders={board?.leaders ?? []} closed={closed} />
      </div>
    </div>
  );
}

function IndexCard({ symbol, index, loading }: { symbol: MarketLiveIndex["symbol"]; index: MarketLiveIndex | undefined; loading: boolean }) {
  const change = index?.changePct ?? null;
  const marketBreadth = index?.breadth;
  return (
    <article className={`${panel} overflow-hidden`}>
      <div className="px-4 pb-2 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">{indexNames[symbol]}</h2>
          <span className="text-xs tabular-nums text-zinc-400">시세 {clock(index?.asOf ?? null)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
          <p className="text-2xl font-semibold tracking-tight">{index?.price == null ? "—" : formatNumber(index.price)}</p>
          <p className={`text-sm font-semibold ${direction(change)}`}>{percent(change)}</p>
        </div>
        {(marketBreadth || index?.turnover != null) && (
          <dl className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
            {index?.turnover != null && <div className="flex gap-1"><dt className="text-zinc-400">거래대금</dt><dd>{formatCompact(index.turnover, "")}원</dd></div>}
            {marketBreadth && <>
              <div className="flex gap-1"><dt className="text-zinc-400">상승</dt><dd className="text-rose-400">{formatNumber(marketBreadth.advancers, 0)}</dd></div>
              <div className="flex gap-1"><dt className="text-zinc-400">보합</dt><dd>{formatNumber(marketBreadth.unchanged, 0)}</dd></div>
              <div className="flex gap-1"><dt className="text-zinc-400">하락</dt><dd className="text-sky-400">{formatNumber(marketBreadth.decliners, 0)}</dd></div>
            </>}
          </dl>
        )}
      </div>
      {index && index.points.length > 1 ? (
        <IntradayChart symbol={symbol} points={index.points} change={change} />
      ) : (
        <div className="flex h-36 items-center justify-center border-t border-white/5 px-3 text-center text-xs text-zinc-400">
          {loading ? "지수를 불러오는 중입니다." : "장중 추이를 표시할 시세가 부족합니다."}
        </div>
      )}
    </article>
  );
}

function chartClock(time: Time): string {
  return typeof time === "number" ? kstClock.format(time * 1000).slice(0, 5) : "";
}

function IntradayChart({ symbol, points, change }: { symbol: MarketLiveIndex["symbol"]; points: MarketLiveIndex["points"]; change: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const instance = createChart(element, {
      autoSize: true,
      height: 144,
      layout: { background: { type: ColorType.Solid, color: "#151a22" }, textColor: "#a1a1aa", fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.07)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false, tickMarkFormatter: chartClock },
      localization: { timeFormatter: chartClock },
      handleScale: false,
      handleScroll: false,
    });
    chart.current = instance;
    series.current = instance.addAreaSeries({ lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    return () => {
      series.current = null;
      chart.current = null;
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const color = change == null || change === 0 ? "#a1a1aa" : change > 0 ? "#fb7185" : "#38bdf8";
    const data = new Map<UTCTimestamp, AreaData>();
    for (const point of points) {
      const time = Math.floor(Date.parse(point.time) / 1000) as UTCTimestamp;
      if (Number.isFinite(time) && Number.isFinite(point.value)) data.set(time, { time, value: point.value });
    }
    series.current?.applyOptions({ lineColor: color, topColor: `${color}33`, bottomColor: `${color}00` });
    series.current?.setData([...data.values()].sort((a, b) => Number(a.time) - Number(b.time)));
    chart.current?.timeScale().fitContent();
  }, [points, change]);

  return <div ref={host} className="h-36 w-full" role="img" aria-label={`${indexNames[symbol]} 장중 지수 추이, 한국시간 기준`} />;
}

function BreadthPanel({ breadth }: { breadth: MarketLiveBoardData["breadth"] | undefined }) {
  const groups = [
    { name: "상승", count: breadth?.up, text: "text-rose-400", bar: "bg-rose-400" },
    { name: "보합", count: breadth?.flat, text: "text-zinc-300", bar: "bg-zinc-500" },
    { name: "하락", count: breadth?.down, text: "text-sky-400", bar: "bg-sky-400" },
  ];
  return (
    <section className={`${panel} grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center`} aria-labelledby="market-live-breadth">
      <div>
        <h2 id="market-live-breadth" className="text-sm font-semibold">상승·하락 종목 수</h2>
        <p className="mt-1 text-xs text-zinc-400">코스피200·코스닥150 구성 종목{breadth?.total ? ` · 비교 가능 ${breadth.compared}/${breadth.total}` : ""}</p>
      </div>
      <div>
        <dl className="mb-2 flex items-center justify-between gap-2 text-xs tabular-nums">
          {groups.map((group) => <div className="flex items-baseline gap-1.5" key={group.name}><dt className="text-zinc-300">{group.name}</dt><dd className={`font-semibold ${group.text}`}>{breadth?.compared ? group.count : "—"}</dd></div>)}
        </dl>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          {!!breadth?.compared && groups.map((group) => !!group.count && <span key={group.name} className={group.bar} style={{ flexGrow: group.count }} />)}
        </div>
      </div>
    </section>
  );
}

function SectorPanel({ sectors }: { sectors: MarketLiveSector[] }) {
  const [risingFirst, setRisingFirst] = useState(true);
  const ranked = [...sectors].sort((a, b) => {
    if (a.changePct == null) return b.changePct == null ? a.name.localeCompare(b.name, "ko") : 1;
    if (b.changePct == null) return -1;
    return risingFirst ? b.changePct - a.changePct : a.changePct - b.changePct;
  });
  return (
    <section className={panel} aria-labelledby="market-live-sectors">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3.5">
        <div>
          <h2 id="market-live-sectors" className="font-semibold">섹터 등락률</h2>
          <p className="mt-1 text-xs text-zinc-400">코스피200·코스닥150 · 섹터별 비교 가능 종목의 동일가중 평균</p>
        </div>
        <button type="button" className={action} onClick={() => setRisingFirst((value) => !value)} aria-label={risingFirst ? "하락률이 큰 섹터부터 정렬" : "상승률이 큰 섹터부터 정렬"}>
          {risingFirst ? "상승순 ↓" : "하락순 ↑"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="border-y border-white/[0.08] bg-white/[0.025] text-zinc-400">
            <tr><th scope="col" className={columnHeader}>섹터</th><th scope="col" className={`${columnHeader} text-right`}>등락률</th><th scope="col" className={`${columnHeader} text-right`}>상승/비교(전체)</th><th scope="col" className={`${columnHeader} text-right`}>시세 시각</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {ranked.map((sector) => (
              <tr key={sector.name}>
                <th scope="row" className="px-3 py-2.5 font-medium">{sector.name}</th>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold ${direction(sector.changePct)}`}>{percent(sector.changePct)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-zinc-300" title={`비교 가능 ${sector.compared} / 전체 ${sector.total} 종목`}>{sector.up}/{sector.compared} <span className="text-zinc-500">({sector.total})</span></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-zinc-400">{clock(sector.asOf)}</td>
              </tr>
            ))}
            {!ranked.length && <EmptyRow columns={4} text="표시할 장중 섹터 등락률이 없습니다." />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const leaderFilters = { all: "전체", KOSPI: "코스피", KOSDAQ: "코스닥" } as const;

function LeaderPanel({ leaders, closed }: { leaders: MarketLiveStock[]; closed: boolean }) {
  const [market, setMarket] = useState<keyof typeof leaderFilters>("all");
  const ranked = leaders.filter((stock) => market === "all" || stock.market === market).slice(0, 10);
  return (
    <section className={panel} aria-labelledby="market-live-leaders">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3.5">
        <div>
          <h2 id="market-live-leaders" className="font-semibold">{closed ? "정규장 주도주" : "장중 주도주"}</h2>
          <p className="mt-1 text-xs text-zinc-400">코스피200·코스닥150의 상승 종목 중 누적 거래대금 상위</p>
        </div>
        <div className="flex rounded-md border border-white/10 p-0.5" role="group" aria-label="주도주 시장 선택">
          {(Object.keys(leaderFilters) as (keyof typeof leaderFilters)[]).map((value) => (
            <button key={value} type="button" onClick={() => setMarket(value)} aria-pressed={market === value} className={`rounded px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-emerald-400 ${market === value ? "bg-emerald-400/15 font-semibold text-emerald-200" : "text-zinc-400 hover:text-zinc-100"}`}>
              {leaderFilters[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="border-y border-white/[0.08] bg-white/[0.025] text-zinc-400">
            <tr><th scope="col" className={columnHeader}>종목</th><th scope="col" className={`${columnHeader} text-right`}>{closed ? "종가" : "현재가"}</th><th scope="col" className={`${columnHeader} text-right`}>등락률</th><th scope="col" className={`${columnHeader} text-right`}>거래대금</th><th scope="col" className={`${columnHeader} text-right`}>시세 시각</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {ranked.map((stock) => (
              <tr key={stock.code}>
                <th scope="row" className="px-3 py-2.5 text-left font-normal">
                  <span className="block font-medium text-zinc-100">{stock.name}</span>
                  <span className="mt-0.5 block text-zinc-400">{stock.code} · {stock.sector}</span>
                </th>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-zinc-200">{formatNumber(stock.price, 0)}원</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold ${direction(stock.changePct)}`}>{percent(stock.changePct)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-zinc-200">{formatCompact(stock.turnover, "")}원</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-zinc-400">{clock(stock.asOf)}</td>
              </tr>
            ))}
            {!ranked.length && <EmptyRow columns={5} text="표시할 장중 주도주가 없습니다." />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="px-3 py-8 text-center text-zinc-400">{text}</td></tr>;
}
