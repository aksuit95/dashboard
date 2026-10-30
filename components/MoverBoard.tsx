"use client";

import { useMemo, useState } from "react";
import type { MoverRow } from "@/lib/view/read";

const markets = ["KOSPI", "KOSDAQ", "US"] as const;

export function MoverBoard({ rows, shortWindow, excluded }: { rows: MoverRow[]; shortWindow: boolean; excluded: number }) {
  const [market, setMarket] = useState<(typeof markets)[number]>("KOSPI");
  const [mode, setMode] = useState<"high" | "move">("high");
  const [span, setSpan] = useState<"daily" | "weekly">("daily");
  const visible = useMemo(() => {
    const filtered = rows.filter((row) => row.market === market);
    if (mode === "high") return filtered.filter((row) => row.high);
    return [...filtered].sort((a, b) => (b[span] ?? -999) - (a[span] ?? -999));
  }, [rows, market, mode, span]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {markets.map((item) => (
          <button key={item} type="button" onClick={() => setMarket(item)} className={`rounded px-2 py-1 text-sm ${market === item ? "bg-white/15" : "text-zinc-500"}`}>{item}</button>
        ))}
        <button type="button" onClick={() => setMode("high")} className={`rounded px-2 py-1 text-sm ${mode === "high" ? "bg-white/15" : "text-zinc-500"}`}>52주 신고가</button>
        <button type="button" onClick={() => setMode("move")} className={`rounded px-2 py-1 text-sm ${mode === "move" ? "bg-white/15" : "text-zinc-500"}`}>등락률</button>
        {mode === "move" ? (
          <>
            <button type="button" onClick={() => setSpan("daily")} className={`rounded px-2 py-1 text-sm ${span === "daily" ? "bg-white/15" : "text-zinc-500"}`}>일간</button>
            <button type="button" onClick={() => setSpan("weekly")} className={`rounded px-2 py-1 text-sm ${span === "weekly" ? "bg-white/15" : "text-zinc-500"}`}>주간</button>
          </>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        설정된 유니버스 안의 종목만 봅니다. 시총 미확인·소형주·ETF 는 제외했고, 이번 조회에서 {excluded}개를 빼 두었습니다.
        {shortWindow ? " 52주(252거래일)가 아직 다 차지 않은 종목이 있습니다." : ""}
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">종목</th>
              <th className="px-3 py-2 text-right">일간</th>
              <th className="px-3 py-2 text-right">주간</th>
              <th className="px-3 py-2 text-right">시총</th>
              <th className="px-3 py-2 text-right">창</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-t border-white/10">
                <td className="px-3 py-2">{row.name}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${tone(row.daily)}`}>{pct(row.daily)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${tone(row.weekly)}`}>{pct(row.weekly)}</td>
                <td className="px-3 py-2 text-right">{row.marketCap}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length ? <p className="mt-3 text-sm text-zinc-500">이 조건의 종목이 없습니다.</p> : null}
    </div>
  );
}

function pct(value: number | null): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function tone(value: number | null): string {
  if (value == null || value === 0) return "text-zinc-400";
  return value > 0 ? "text-rose-300" : "text-sky-300";
}
