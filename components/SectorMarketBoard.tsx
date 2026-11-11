"use client";
import { useState } from "react";
import { SectorReturnsBoard } from "@/components/SectorReturnsBoard";
import { UsSectorReturnsBoard } from "@/components/UsSectorReturnsBoard";
import { StockReturnsBoard } from "@/components/StockReturnsBoard";
export function SectorMarketBoard() {
  const [view, setView] = useState<"sector" | "stock">("sector");
  const [market,setMarket] = useState<"kr" | "us">("kr");
  return <><div aria-label="등락률 화면 선택" className="mb-5 flex gap-2 border-b border-white/10"><button type="button" aria-pressed={view === "sector"} onClick={() => setView("sector")} className={`border-b-2 px-4 py-3 text-sm font-semibold ${view === "sector" ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-400"}`}>섹터별 등락률</button><button type="button" aria-pressed={view === "stock"} onClick={() => setView("stock")} className={`border-b-2 px-4 py-3 text-sm font-semibold ${view === "stock" ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-400"}`}>종목별 등락률</button></div>{view === "stock" ? <StockReturnsBoard /> : <><div aria-label="시장 선택" className="mb-5 flex gap-2"><button aria-pressed={market === "kr"} onClick={() => setMarket("kr")} className={`rounded-md px-4 py-2 text-sm ${market === "kr" ? "bg-zinc-100 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>한국 시장</button><button aria-pressed={market === "us"} onClick={() => setMarket("us")} className={`rounded-md px-4 py-2 text-sm ${market === "us" ? "bg-zinc-100 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>미국 시장</button></div>{market === "kr" ? <SectorReturnsBoard /> : <UsSectorReturnsBoard />}</>}</>;
}
