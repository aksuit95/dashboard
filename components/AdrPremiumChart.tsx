"use client";

import { useEffect, useState } from "react";
import { RangeChart } from "@/components/RangeChart";
import { formatNumber, formatSigned } from "@/lib/format";

type Point = { date: string; value: number; commonKrw: number; adrPerShareKrw: number };

function isBook(value: unknown): value is { points: Point[] } {
  if (!value || typeof value !== "object" || !Array.isArray((value as { points?: unknown }).points)) return false;
  return (value as { points: unknown[] }).points.every((point) => {
    if (!point || typeof point !== "object") return false;
    const row = point as Point;
    return typeof row.date === "string" && Number.isFinite(row.value) && Number.isFinite(row.commonKrw) && Number.isFinite(row.adrPerShareKrw);
  });
}

export function AdrPremiumChart() {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/proxy/adr-premium", { signal: controller.signal });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "괴리율을 불러오지 못했습니다.";
          setError(message);
          return;
        }
        if (!isBook(payload)) {
          setError("괴리율 응답이 비어 있습니다.");
          return;
        }
        setPoints(payload.points);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("괴리율을 불러오지 못했습니다.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const latest = points?.at(-1) ?? null;
  const tone = latest == null || latest.value === 0 ? "text-zinc-200" : latest.value > 0 ? "text-rose-400" : "text-sky-400";

  return (
    <section className="rounded-xl border border-white/10 bg-[#151a22] p-4 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">SK하이닉스 본주 · 미국 ADR 괴리율</h3>
          <p className="mt-1 text-xs text-zinc-500">SKHY 1 ADS = 보통주 0.1주. 같은 날짜의 종가와 원달러로 1주 원화를 맞춥니다.</p>
        </div>
        {latest ? (
          <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{formatSigned(latest.value)}%</p>
        ) : null}
      </div>
      {latest ? (
        <p className="mt-2 text-xs text-zinc-400">
          {latest.date} · 본주 ₩{formatNumber(latest.commonKrw, 0)} · ADR 1주 환산 ₩{formatNumber(latest.adrPerShareKrw, 0)}
        </p>
      ) : null}
      <div className="mt-4">
        {points == null && !error ? <p className="py-8 text-sm text-zinc-500">괴리율 차트를 불러오는 중입니다.</p> : null}
        {error ? <p className="py-8 text-sm text-amber-300">{error}</p> : null}
        {points && points.length === 0 ? <p className="py-8 text-sm text-zinc-500">겹치는 거래일이 없습니다.</p> : null}
        {points && points.length > 0 ? <RangeChart points={points} digits={2} color="#38bdf8" /> : null}
      </div>
    </section>
  );
}
