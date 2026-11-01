"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { proxyRanges, type ProxyRange, type ProxyVenue } from "@/config/proxy";
import { AdrPremiumChart } from "@/components/AdrPremiumChart";
import { formatNumber, formatSigned } from "@/lib/format";
import { fxRate, kimchiPercent, premiumVs, type Candle, type PerpQuote, type ProxyBoard, type ProxyNameQuote } from "@/lib/sources/proxy-board";
import { CandleChart } from "@/components/CandleChart";

const venues: { id: ProxyVenue; label: string }[] = [
  { id: "naver", label: "네이버 증권 · 시세" },
  { id: "binance", label: "바이낸스" },
  { id: "hyperliquid", label: "하이퍼리퀴드" },
];

const rangeLabel: Record<ProxyRange, string> = {
  "1D": "1일",
  "1W": "1주",
  "1M": "1달",
  "3M": "3달",
  "1Y": "1년",
};

function isBoard(value: unknown): value is ProxyBoard {
  if (!value || typeof value !== "object") return false;
  const board = value as ProxyBoard;
  return Array.isArray(board.names) && Boolean(board.fx);
}

function tone(value: number | null): string {
  if (value == null || value === 0) return "text-zinc-200";
  return value > 0 ? "text-rose-400" : "text-sky-400";
}

function krw(value: number, digits = 0): string {
  return `₩${formatNumber(value, digits)}원`;
}

function signedWon(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₩${formatNumber(Math.abs(value), 0)}`;
}

function compactKrw(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `₩${formatNumber(value / 1e12, 2)}조`;
  if (abs >= 1e8) return `₩${formatNumber(value / 1e8, 2)}억`;
  return `₩${formatNumber(value, 0)}`;
}

function seoulClockText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function convertCandles(candles: Candle[], unit: "KRW" | "USD", rate: number | null): Candle[] {
  if (unit === "KRW" || rate == null) return candles;
  return candles.map((candle) => ({
    time: candle.time,
    open: candle.open * rate,
    high: candle.high * rate,
    low: candle.low * rate,
    close: candle.close * rate,
  }));
}

export function ProxyBoard() {
  const [board, setBoard] = useState<ProxyBoard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [kimchiOn, setKimchiOn] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    let timer = 0;
    async function load() {
      if (document.hidden) return;
      const id = ++seq.current;
      try {
        const response = await fetch("/api/proxy/board");
        const payload: unknown = await response.json();
        if (id !== seq.current) return;
        if (!response.ok || !isBoard(payload)) {
          setProblem("시세를 갱신하지 못했습니다.");
          return;
        }
        setBoard(payload);
        setProblem(null);
      } catch {
        if (id === seq.current) setProblem("시세를 갱신하지 못했습니다.");
      }
    }
    void load();
    timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, []);

  const rate = board ? fxRate(board.fx, kimchiOn) : null;
  const kimchi = board ? kimchiPercent(board.fx.upbitUsdt, board.fx.naverUsdKrw) : null;

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>업비트 USDT {board?.fx.upbitUsdt == null ? "—" : krw(board.fx.upbitUsdt)}</span>
          <span>네이버 환율 {board?.fx.naverUsdKrw == null ? "—" : krw(board.fx.naverUsdKrw, 2)}</span>
          <span className={tone(kimchi)}>김프 {kimchi == null ? "—" : `${formatSigned(kimchi)}%`}</span>
          {board ? <span>{seoulClockText(board.asOf)}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => setKimchiOn((value) => !value)}
          className={`rounded-full border px-2.5 py-1 ${kimchiOn ? "border-emerald-500/50 text-emerald-300" : "border-white/15 text-zinc-400"}`}
        >
          김프 {kimchiOn ? "ON" : "OFF"}
        </button>
      </div>
      {problem ? <p className="mb-3 text-xs text-amber-300">{problem}</p> : null}
      {board ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {board.names.map((name) => (
            <Fragment key={name.id}>
              <ProxyCard name={name} kimchiOn={kimchiOn} rate={rate} onToggleKimchi={() => setKimchiOn((value) => !value)} />
              {name.id === "000660" ? <AdrPremiumChart /> : null}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl bg-[#151a22]" />
          <div className="h-72 animate-pulse rounded-xl bg-[#151a22]" />
        </div>
      )}
    </section>
  );
}

function ProxyCard({
  name,
  kimchiOn,
  rate,
  onToggleKimchi,
}: {
  name: ProxyNameQuote;
  kimchiOn: boolean;
  rate: number | null;
  onToggleKimchi: () => void;
}) {
  const [venue, setVenue] = useState<ProxyVenue>("naver");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [range, setRange] = useState<ProxyRange>("1D");
  const menuRef = useRef<HTMLDivElement>(null);
  const venueLabel = venues.find((item) => item.id === venue)?.label ?? venue;
  const symbol = venue === "binance" ? name.binanceSymbol : venue === "hyperliquid" ? name.hyperliquidCoin : `KRX · ${name.code}`;

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  return (
    <article className="rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{name.name}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{symbol}</p>
        </div>
        <div className="flex items-center gap-2">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-zinc-300"
            >
              {venueLabel}
            </button>
            {menuOpen ? (
              <ul role="listbox" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-white/10 bg-[#151a22] py-1 text-sm shadow-lg">
                {venues.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={item.id === venue}
                      onClick={() => {
                        setVenue(item.id);
                        setMenuOpen(false);
                      }}
                      className={`block w-full px-3 py-1.5 text-left ${item.id === venue ? "text-zinc-100" : "text-zinc-400 hover:bg-white/5"}`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            aria-pressed={chartOpen}
            onClick={() => setChartOpen((value) => !value)}
            className={`rounded-full border px-2.5 py-1 text-xs ${chartOpen ? "border-white/40 text-zinc-100" : "border-white/15 text-zinc-400"}`}
          >
            {chartOpen ? "차트 닫기" : "차트"}
          </button>
        </div>
      </div>
      {venue === "naver" ? (
        <NaverBody name={name} rate={rate} />
      ) : (
        <PerpBody name={name} venue={venue} kimchiOn={kimchiOn} rate={rate} onToggleKimchi={onToggleKimchi} />
      )}
      {chartOpen ? <ChartPanel id={name.id} venue={venue} range={range} onRange={setRange} rate={rate} /> : null}
    </article>
  );
}

function NaverBody({ name, rate }: { name: ProxyNameQuote; rate: number | null }) {
  const quote = name.naver;
  if (!quote) return <p className="mt-6 text-sm text-amber-300">{name.errors.naver ?? "네이버 시세가 없습니다."}</p>;
  const base = quote.regularClose ?? quote.price;
  return (
    <div>
      <p className={`mt-4 text-3xl font-semibold tabular-nums ${tone(quote.change)}`}>{krw(quote.price)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className={`tabular-nums ${tone(quote.change)}`}>
          {quote.change == null ? "—" : `${quote.change < 0 ? "▼" : quote.change > 0 ? "▲" : "–"} ${formatNumber(Math.abs(quote.change), 0)}`}
          {quote.changePct == null ? "" : `  ${formatSigned(quote.changePct)}%`}
        </span>
        <span className="text-xs text-zinc-500">전일 대비</span>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-zinc-300">{quote.sessionLabel}</span>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-xs">
        <Stat label="전일 종가" value={quote.previousClose == null ? "—" : krw(quote.previousClose)} />
        <Stat label="정규장 종가" value={quote.regularClose == null ? "—" : krw(quote.regularClose)} />
        <Stat label="NXT 가격" value={quote.nxtPrice == null ? "—" : krw(quote.nxtPrice)} />
      </dl>
      <HyperFooter hyper={name.hyperliquid} base={base} rate={rate} missing={name.errors.hyperliquid} symbol={name.hyperliquidCoin} />
    </div>
  );
}

function HyperFooter({
  hyper,
  base,
  rate,
  missing,
  symbol,
}: {
  hyper: PerpQuote | null;
  base: number | null;
  rate: number | null;
  missing?: string;
  symbol: string;
}) {
  if (!hyper?.markUsd) return <p className="mt-4 text-xs text-zinc-500">{missing ?? "하이퍼리퀴드 시세가 없습니다."}</p>;
  const krwPrice = rate == null ? null : hyper.markUsd * rate;
  const gap = premiumVs(krwPrice, base);
  return (
    <div className="mt-5 flex items-end justify-between gap-3 border-t border-white/10 pt-3 text-xs">
      <div>
        <p className="text-zinc-500">HYPERLIQUID 시세</p>
        <p className="mt-1 text-sm tabular-nums text-zinc-100">{krwPrice == null ? "—" : krw(krwPrice)}</p>
        <p className="mt-0.5 tabular-nums text-zinc-400">≈ ${formatNumber(hyper.markUsd, 2)}</p>
      </div>
      <div className="text-right">
        <p className={`tabular-nums ${tone(gap?.diff ?? null)}`}>{gap ? `${formatSigned(gap.pct)}%  ${signedWon(gap.diff)}` : "—"}</p>
        <p className="mt-0.5 text-zinc-500">{symbol}</p>
      </div>
    </div>
  );
}

function PerpBody({
  name,
  venue,
  kimchiOn,
  rate,
  onToggleKimchi,
}: {
  name: ProxyNameQuote;
  venue: "binance" | "hyperliquid";
  kimchiOn: boolean;
  rate: number | null;
  onToggleKimchi: () => void;
}) {
  const perp = venue === "binance" ? name.binance : name.hyperliquid;
  const quote = name.naver;
  const base = quote?.regularClose ?? quote?.price ?? null;
  if (!perp?.markUsd) return <p className="mt-6 text-sm text-amber-300">{name.errors[venue] ?? "시세가 없습니다."}</p>;
  const krwPrice = rate == null ? null : perp.markUsd * rate;
  const gap = premiumVs(krwPrice, base);
  const volume = perp.quoteVolumeUsd == null || rate == null ? null : perp.quoteVolumeUsd * rate;
  const hourlyPct = perp.fundingHourly == null ? null : perp.fundingHourly * 100;
  const apr = perp.fundingHourly == null ? null : perp.fundingHourly * 24 * 365 * 100;
  const basisLabel = quote?.tradeDate ? `${quote.tradeDate} 종가 기준` : "종가 기준";
  return (
    <div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <p className={`text-3xl font-semibold tabular-nums ${tone(gap?.diff ?? null)}`}>{krwPrice == null ? `$${formatNumber(perp.markUsd, 2)}` : krw(krwPrice)}</p>
        <button type="button" onClick={onToggleKimchi} className={`mb-1 rounded-full border px-2 py-0.5 text-[11px] ${kimchiOn ? "border-emerald-500/50 text-emerald-300" : "border-white/15 text-zinc-400"}`}>
          김프 {kimchiOn ? "ON" : "OFF"}
        </button>
      </div>
      <p className="mt-1 text-sm text-zinc-400">≈ ${formatNumber(perp.markUsd, 2)} USD</p>
      <p className={`mt-2 text-sm tabular-nums ${tone(gap?.diff ?? null)}`}>
        {gap ? `${gap.diff < 0 ? "▼" : "▲"} ${formatNumber(Math.abs(gap.diff), 0)}  ${formatSigned(gap.pct)}%` : "네이버 종가 없음"}
        <span className="ml-2 text-xs text-zinc-500">{basisLabel}</span>
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
        <Stat label={basisLabel} value={base == null ? "—" : krw(base)} />
        <Stat label="24H 거래대금" value={volume == null ? "—" : compactKrw(volume)} />
        <Stat label="미결제약정" value={perp.openInterest == null ? "—" : formatNumber(perp.openInterest, 0)} />
        <Stat
          label="펀딩비 (1H)"
          value={hourlyPct == null || apr == null ? "—" : `${formatSigned(hourlyPct, 4)}% · APR ${formatSigned(apr)}%`}
          valueClass={tone(hourlyPct)}
        />
      </dl>
      <p className={`mt-4 text-sm tabular-nums ${tone(gap?.diff ?? null)}`}>
        프리미엄 {gap ? `${formatSigned(gap.pct)}%  ${signedWon(gap.diff)}` : "—"}
        <span className="ml-2 text-xs text-zinc-500">네이버 {base == null ? "—" : krw(base)}</span>
      </p>
    </div>
  );
}

function Stat({ label, value, valueClass = "text-zinc-100" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`mt-1 tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

function ChartPanel({
  id,
  venue,
  range,
  onRange,
  rate,
}: {
  id: string;
  venue: ProxyVenue;
  range: ProxyRange;
  onRange: (range: ProxyRange) => void;
  rate: number | null;
}) {
  const [book, setBook] = useState<{ unit: "KRW" | "USD"; candles: Candle[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBook(null);
    async function load() {
      try {
        const response = await fetch(`/api/proxy/candles?id=${id}&venue=${venue}&range=${range}`, { signal: controller.signal });
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "차트를 불러오지 못했습니다.";
          setError(message);
          return;
        }
        if (!payload || typeof payload !== "object" || !Array.isArray((payload as { candles?: unknown }).candles)) {
          setError("차트 응답이 비어 있습니다.");
          return;
        }
        const body = payload as { unit?: unknown; candles: Candle[] };
        setBook({ unit: body.unit === "USD" ? "USD" : "KRW", candles: body.candles });
      } catch (reason) {
        if (cancelled || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setError("차트를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, venue, range]);

  const candles = useMemo(() => (book ? convertCandles(book.candles, book.unit, rate) : []), [book, rate]);
  const digits = book?.unit === "USD" && rate == null ? 2 : 0;
  const fxNote = book?.unit === "USD" ? (rate == null ? "환율이 없어 달러로 표시합니다." : "현재 환율로 환산한 가격입니다.") : "네이버 차트는 원화 가격입니다.";

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {proxyRanges.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onRange(item)}
            className={`rounded px-2 py-1 text-xs ${range === item ? "bg-white/15 text-white" : "text-zinc-500"}`}
          >
            {rangeLabel[item]}
          </button>
        ))}
      </div>
      {loading ? <p className="py-8 text-sm text-zinc-500">차트를 불러오는 중입니다.</p> : null}
      {!loading && error ? <p className="py-8 text-sm text-amber-300">{error}</p> : null}
      {!loading && !error && candles.length === 0 ? <p className="py-8 text-sm text-zinc-500">이 구간의 캔들이 없습니다.</p> : null}
      {!loading && !error && candles.length > 0 ? <CandleChart candles={candles} digits={digits} /> : null}
      <p className="mt-2 text-[11px] text-zinc-500">{fxNote}</p>
    </div>
  );
}
