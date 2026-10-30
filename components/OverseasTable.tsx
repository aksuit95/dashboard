"use client";

import { useState } from "react";

const windows = [
  { id: "daily", label: "일간" },
  { id: "monthly", label: "월간" },
  { id: "ytd", label: "연초 이후" },
  { id: "yearly", label: "연간" },
] as const;

export function OverseasTable({
  tables,
}: {
  tables: Record<string, { asOf: string | null; rows: { rank: number; name: string; buy: number; sell: number; net: number }[] }>;
}) {
  const [window, setWindow] = useState<(typeof windows)[number]["id"]>("daily");
  const table = tables[window];
  return (
    <div>
      <div className="mb-3 flex gap-2">
        {windows.map((item) => (
          <button key={item.id} type="button" onClick={() => setWindow(item.id)} className={`rounded px-2 py-1 text-sm ${window === item.id ? "bg-white/15" : "text-zinc-500"}`}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="mb-2 text-xs text-zinc-500">기준일 {table?.asOf ?? "없음"} · 결제 기준이라 장중 체결과 날짜가 다를 수 있습니다.</p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-right">#</th>
              <th className="px-3 py-2 text-left">종목</th>
              <th className="px-3 py-2 text-right">매수</th>
              <th className="px-3 py-2 text-right">매도</th>
              <th className="px-3 py-2 text-right">순매수</th>
            </tr>
          </thead>
          <tbody>
            {(table?.rows ?? []).map((row) => (
              <tr key={row.rank} className="border-t border-white/10">
                <td className="px-3 py-2 text-right tabular-nums">{row.rank}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.buy.toLocaleString("ko-KR")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.sell.toLocaleString("ko-KR")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-300">{row.net.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
