"use client";

import { useState } from "react";
import { SectorReturnsBoard } from "@/components/SectorReturnsBoard";
import { StockReturnsBoard } from "@/components/StockReturnsBoard";

export function SectorMarketBoard() {
  const [view, setView] = useState<"sector" | "stock">("sector");
  const [market, setMarket] = useState<"kr" | "us">("kr");
  return <>
    <div aria-label="등락률 화면 선택" className="mb-5 flex gap-2 border-b border-white/10">
      {([["sector", "섹터별 등락률"], ["stock", "종목별 등락률"]] as const).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
          className={`border-b-2 px-4 py-3 text-sm font-semibold ${view === id ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-400"}`}>{label}</button>)}
    </div>
    <div aria-label="시장 선택" className="mb-5 flex gap-2">
      {([["kr", "한국 시장"], ["us", "미국 시장"]] as const).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={market === id} onClick={() => setMarket(id)}
          className={`rounded-md px-4 py-2 text-sm ${market === id ? "bg-zinc-100 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>{label}</button>)}
    </div>
    {view === "stock" ? <StockReturnsBoard key={market} region={market} /> : <SectorReturnsBoard key={market} market={market} />}
  </>;
}
