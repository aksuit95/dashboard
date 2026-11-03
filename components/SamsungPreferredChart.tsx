"use client";

import { useEffect, useState } from "react";
import { RangeChart } from "@/components/RangeChart";
import { formatNumber, formatSigned } from "@/lib/format";
import type { PreferredDiscountPoint } from "@/lib/market/preferred-discount";
import { useDailyClose } from "@/components/useDailyClose";

function isBook(value: unknown): value is { points: PreferredDiscountPoint[] } {
  if (!value || typeof value !== "object" || !Array.isArray((value as { points?: unknown }).points)) return false;
  return (value as { points: unknown[] }).points.every((point) => {
    if (!point || typeof point !== "object") return false;
    const row = point as PreferredDiscountPoint;
    return typeof row.date === "string" && Number.isFinite(row.value) && Number.isFinite(row.commonKrw) && Number.isFinite(row.preferredKrw);
  });
}

export function SamsungPreferredChart() {
  const dailyClose = useDailyClose();
  const [points, setPoints] = useState<PreferredDiscountPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/proxy/samsung-preferred", { signal: controller.signal });
        const payload: unknown = await response.json();
        if (!response.ok || !isBook(payload)) {
          setError("삼성전자 보통주·우선주 괴리율을 불러오지 못했습니다.");
          return;
        }
        if (controller.signal.aborted) return;
        setError(null);
        setPoints(payload.points);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("삼성전자 보통주·우선주 괴리율을 불러오지 못했습니다.");
      }
    }
    void load();
    return () => controller.abort();
  }, [dailyClose]);

  const latest = points?.at(-1);
  const tone = !latest || latest.value === 0 ? "text-zinc-200" : latest.value > 0 ? "text-rose-400" : "text-sky-400";

  return (
    <section className="rounded-xl border border-white/10 bg-[#151a22] p-4 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">삼성전자 보통주 · 우선주 괴리율</h3>
          <p className="mt-1 text-xs text-zinc-500">(보통주 − 우선주) ÷ 보통주 × 100 · 양수는 우선주 할인, 음수는 우선주 할증입니다.</p>
        </div>
        {latest ? <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{formatSigned(latest.value)}%</p> : null}
      </div>
      <p className="mt-2 text-xs text-zinc-500">005930 / 005935 · Yahoo Finance · 동일 거래일 종가 기준</p>
      {latest ? (
        <p className="mt-2 text-xs text-zinc-400">
          {latest.date} 15:30 KST · 보통주 ₩{formatNumber(latest.commonKrw, 0)} · 우선주 ₩{formatNumber(latest.preferredKrw, 0)}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500">정규장 종가 기준 · 매일 16:00 이후 1회 갱신 · 휴장일은 직전 종가 유지</p>
      <div className="mt-4">
        {points == null && !error ? <p className="py-8 text-sm text-zinc-500">괴리율 차트를 불러오는 중입니다.</p> : null}
        {error ? <p className="py-8 text-sm text-amber-300">{error}</p> : null}
        {points?.length === 0 ? <p className="py-8 text-sm text-zinc-500">겹치는 거래일이 없습니다.</p> : null}
        {points && points.length > 0 ? <RangeChart points={points} digits={2} color="#fbbf24" /> : null}
      </div>
    </section>
  );
}
