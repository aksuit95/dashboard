"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber, formatSigned } from "@/lib/format";
import type { MarketBoard, MarketCard } from "@/lib/sources/futures-board";

const REFRESH_MS = 20_000;

function isBoard(value: unknown): value is MarketBoard {
  if (!value || typeof value !== "object") return false;
  const board = value as MarketBoard;
  return [board.futures, board.asia, board.usIndicators, board.currencies, board.macro].every(Array.isArray);
}

function tone(value: number | null): string {
  if (value == null || value === 0) return "text-zinc-200";
  return value > 0 ? "text-rose-400" : "text-sky-400";
}

function priceText(card: MarketCard): string {
  if (card.price == null) return "—";
  if (card.unit === "percent") return `${formatNumber(card.price, 2)}%`;
  if (card.unit === "usd") return `$${formatNumber(card.price, 2)}`;
  return formatNumber(card.price, 2);
}

function sessionLabel(session: MarketCard["session"]): string {
  if (session === "live") return "최근 시세";
  if (session === "closed") return "장마감";
  return "없음";
}

export function FuturesBoard() {
  const [board, setBoard] = useState<MarketBoard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let timer = 0;
    async function load() {
      if (document.hidden) return;
      const id = ++seq.current;
      try {
        const response = await fetch("/api/futures/board");
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
      {problem ? <p className="text-xs text-amber-300">{problem}</p> : null}
      <Section title="지수 선물" description="코스피200 야간선물과 미국 주요 지수 선물." cards={board?.futures} />
      <Section title="아시아 증시" description="일본·대만·중국 기술주의 현물 지수." cards={board?.asia} />
      <Section title="미국 시장 지표" description="반도체 업종 흐름과 옵션에 반영된 예상 변동성." cards={board?.usIndicators} />
      <Section title="환율·달러" description="원화 환율과 주요 통화 대비 달러 강도." cards={board?.currencies} />
      <Section title="금리·원자재" description="미국 장기 국채 금리와 국제 유가." cards={board?.macro} />
    </div>
  );
}

function Section({ title, description, cards }: { title: string; description: string; cards: MarketCard[] | undefined }) {
  return (
    <section>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mb-3 text-sm text-zinc-500">{description}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards ? cards.map((card) => <Quote key={card.id} card={card} />) : <Skeleton />}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <>
      <div className="h-36 animate-pulse rounded-xl bg-[#151a22]" />
      <div className="h-36 animate-pulse rounded-xl bg-[#151a22]" />
      <div className="h-36 animate-pulse rounded-xl bg-[#151a22]" />
    </>
  );
}

function Quote({ card }: { card: MarketCard }) {
  const direction = card.change == null ? "" : card.change < 0 ? "▼" : card.change > 0 ? "▲" : "–";
  return (
    <article className="rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{card.name}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {card.symbol} · {card.venue}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${card.session === "live" ? "border-emerald-500/50 text-emerald-300" : "border-white/15 text-zinc-400"}`}>
          {sessionLabel(card.session)}
        </span>
      </div>
      <p className={`mt-4 text-3xl font-semibold tabular-nums ${tone(card.change)}`}>{priceText(card)}</p>
      <p className={`mt-1 text-sm tabular-nums ${tone(card.change)}`}>
        {card.change == null || card.changePct == null
          ? card.error ?? "대비 없음"
          : `${direction} ${formatNumber(Math.abs(card.change), 2)}  ${formatSigned(card.changePct)}%`}
      </p>
    </article>
  );
}
