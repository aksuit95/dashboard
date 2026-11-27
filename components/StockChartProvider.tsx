"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StockChartRequest } from "@/lib/stock-radar/model";

const StockChartDialog = dynamic(() => import("@/components/StockChartDialog"), { ssr: false });
const OpenStockChart = createContext<((stock: StockChartRequest) => void) | null>(null);

export function StockChartProvider({ children }: { children: ReactNode }) {
  const [stock, setStock] = useState<StockChartRequest | null>(null);
  const pathname = usePathname();
  useEffect(() => setStock(null), [pathname]);
  return (
    <OpenStockChart.Provider value={setStock}>
      {children}
      {stock && <StockChartDialog key={stock.code} stock={stock} onClose={() => setStock(null)} />}
    </OpenStockChart.Provider>
  );
}

export function StockChartButton({ code, name, chart, className = "" }: {
  code: string | null | undefined;
  name: string;
  chart?: StockChartRequest["radar"];
  className?: string;
}) {
  const openChart = useContext(OpenStockChart);
  if (!code || !/^[0-9A-Z]{6}$/.test(code) || !openChart) return <span className={className}>{name}</span>;
  return (
    <button type="button" aria-haspopup="dialog" aria-label={name + " 차트"}
      className={"rounded-sm text-left underline decoration-current/30 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-emerald-400 " + className}
      onClick={event => { event.stopPropagation(); openChart({ code, name, radar: chart }); }}>
      {name}
    </button>
  );
}
