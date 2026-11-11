"use client";
import { useState } from "react";
import { SectorReturnsBoard } from "@/components/SectorReturnsBoard";
import { UsSectorReturnsBoard } from "@/components/UsSectorReturnsBoard";
export function SectorMarketBoard() {
  const [market,setMarket] = useState<"kr" | "us">("kr");
  return <><div aria-label="시장 선택" className="mb-5 flex gap-2"><button aria-pressed={market === "kr"} onClick={() => setMarket("kr")} className={`rounded-md px-4 py-2 text-sm ${market === "kr" ? "bg-zinc-100 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>한국 시장</button><button aria-pressed={market === "us"} onClick={() => setMarket("us")} className={`rounded-md px-4 py-2 text-sm ${market === "us" ? "bg-zinc-100 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>미국 시장</button></div>{market === "kr" ? <SectorReturnsBoard /> : <UsSectorReturnsBoard />}</>;
}
