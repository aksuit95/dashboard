"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock, formatHm, seoulMinutes, seoulSession, sessionSpans, usCashSpan, type SessionKind } from "@/lib/market/kr-session";
import { formatNumber, formatSigned } from "@/lib/format";
import type { SingleStockBoard, SingleStockCard, SingleStockGroup } from "@/lib/sources/single-stock";

const REFRESH_MS = 20_000;
const DAY = 24 * 60;

const spanColor: Record<Exclude<SessionKind, "closed">, string> = {
  kr: "bg-sky-500",
  after: "bg-zinc-300",
  nxt: "bg-violet-400",
  us: "bg-amber-400",
};

function isBoard(value: unknown): value is SingleStockBoard {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as SingleStockBoard).names);
}

function tone(value: number | null): string {
  if (value == null || value === 0) return "text-zinc-200";
  return value > 0 ? "text-rose-400" : "text-sky-400";
}

export function SingleStockBoard() {
  const [board, setBoard] = useState<SingleStockBoard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const clock = window.setInterval(tick, 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let timer = 0;
    async function load() {
      if (document.hidden) return;
      const id = ++seq.current;
      try {
        const response = await fetch("/api/single-stock/board");
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
    timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-8">
      <SessionStrip now={now} />
      {problem ? <p className="text-xs text-amber-300">{problem}</p> : null}
      <div className="grid gap-6 sm:grid-cols-2">
        {board ? board.names.map((group) => <NameColumn key={group.code} group={group} />) : <Skeleton />}
      </div>
    </div>
  );
}

function SessionStrip({ now }: { now: Date | null }) {
  const session = now ? seoulSession(now) : null;
  const us = now ? usCashSpan(now) : { start: 23 * 60 + 30, end: 6 * 60 };
  const spans = now ? sessionSpans(now) : sessionSpans(new Date("2026-01-15T12:00:00Z"));
  const marker = now ? (seoulMinutes(now) / DAY) * 100 : null;
  return (
    <section className="rounded-xl border border-white/10 bg-[#151a22] px-4 py-4">
      <div className="mb-3 flex items-center justify-center gap-3 text-sm">
        <span className="text-zinc-500">현재 (KST)</span>
        <span className="font-semibold tabular-nums">{now ? formatClock(now) : "--:--:--"}</span>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-zinc-300">{session?.label ?? "확인 중"}</span>
      </div>
      <div className="relative h-3 rounded-full bg-white/5">
        {spans.map((span) => (
          <div
            key={`${span.kind}-${span.start}`}
            className={`absolute ${span.kind === "nxt" ? "bottom-0 h-1" : "top-0 h-full"} ${spanColor[span.kind]}`}
            style={{ left: `${(span.start / DAY) * 100}%`, width: `${((span.end - span.start) / DAY) * 100}%` }}
          />
        ))}
        {marker != null ? <div className="absolute -top-1 h-5 w-px bg-white" style={{ left: `${marker}%` }} /> : null}
      </div>
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-zinc-600">
        <span>0</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
        <Legend kind="kr" text="KR 정규 09:00–15:30" />
        <Legend kind="after" text="애프터 16:00–20:00" />
        <Legend kind="nxt" text="NXT 08:00–09:00 · 15:30–20:00" />
        <Legend kind="us" text={`US 정규 ${formatHm(us.start)}–${formatHm(us.end)}`} />
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-white/10" />
          휴장
        </span>
      </div>
    </section>
  );
}

function Legend({ kind, text }: { kind: Exclude<SessionKind, "closed">; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-3 rounded-sm ${spanColor[kind]}`} />
      {text}
    </span>
  );
}

function NameColumn({ group }: { group: SingleStockGroup }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">{group.name}</h2>
        <p className={`text-sm font-medium tabular-nums ${tone(group.changePct)}`}>
          {group.changePct == null ? "—" : `${formatSigned(group.changePct)}%`}
        </p>
      </div>
      <div className="space-y-3">
        {group.products.map((card) => (
          <ProductCard key={card.code} card={card} />
        ))}
      </div>
    </section>
  );
}

function ProductCard({ card }: { card: SingleStockCard }) {
  const direction = card.change == null ? "" : card.change < 0 ? "▼" : card.change > 0 ? "▲" : "–";
  return (
    <article className="rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] tracking-wide text-zinc-300">{card.brand}</span>
        <h3 className="text-sm text-zinc-300">{card.product}</h3>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className={`text-3xl font-semibold tabular-nums ${tone(card.change)}`}>
            {card.price == null ? "—" : `₩${formatNumber(card.price, 0)}`}
          </p>
          <p className={`mt-1 text-sm tabular-nums ${tone(card.change)}`}>
            {card.change == null || card.changePct == null
              ? card.error ?? "대비 없음"
              : `${direction} ${formatNumber(Math.abs(card.change), 0)}  ${formatSigned(card.changePct)}% · 전일 대비`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-zinc-500">괴리율</p>
          <p className={`text-xl font-semibold tabular-nums ${tone(card.premium)}`}>
            {card.premium == null ? "—" : `${formatSigned(card.premium)}%`}
          </p>
        </div>
      </div>
      <PremiumBar premium={card.premium} />
    </article>
  );
}

function PremiumBar({ premium }: { premium: number | null }) {
  const clamped = premium == null ? 0 : Math.min(1, Math.max(-1, premium));
  const marker = ((clamped + 1) / 2) * 100;
  const fillLeft = Math.min(50, marker);
  const fillWidth = Math.abs(marker - 50);
  return (
    <div className="mt-4">
      <div className="relative h-1.5 rounded-full bg-white/10">
        {premium != null && fillWidth > 0 ? (
          <div
            className={`absolute top-0 h-full ${premium > 0 ? "bg-rose-400" : "bg-sky-400"}`}
            style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
          />
        ) : null}
        <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ left: `${marker}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>할인 -1%</span>
        <span>0 · iNAV</span>
        <span>+1% 할증</span>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="h-80 animate-pulse rounded-xl bg-[#151a22]" />
      <div className="h-80 animate-pulse rounded-xl bg-[#151a22]" />
    </>
  );
}
