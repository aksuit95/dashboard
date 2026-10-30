import type { QuotePayload, SourceResult } from "@/lib/sources/types";
import { empty, ok, stale } from "@/lib/sources/types";

type Asset = { name?: string };
type Ctx = { markPx?: string; prevDayPx?: string; funding?: string };

export async function fetchHyperliquid(symbols: string[]): Promise<SourceResult<Map<string, QuotePayload>>> {
  if (!symbols.length) return empty("Hyperliquid 심볼이 없습니다.");
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs", dex: "xyz" }),
    });
    if (!response.ok) return stale(`Hyperliquid 응답 ${response.status}`);
    const body = (await response.json()) as [{ universe?: Asset[] }, Ctx[]];
    const universe = body?.[0]?.universe ?? [];
    const contexts = body?.[1] ?? [];
    const wanted = new Set(symbols);
    const map = new Map<string, QuotePayload>();
    const now = new Date().toISOString();
    universe.forEach((asset, index) => {
      const name = asset.name;
      if (!name || !wanted.has(name)) return;
      const ctx = contexts[index];
      const price = Number(ctx?.markPx);
      const previous = Number(ctx?.prevDayPx);
      if (!Number.isFinite(price)) return;
      map.set(name, {
        price,
        previousClose: Number.isFinite(previous) ? previous : null,
        asOf: now,
        session: "live",
        fundingHourly: ctx?.funding != null && Number.isFinite(Number(ctx.funding)) ? Number(ctx.funding) : null,
        sharesOutstanding: null,
        marketCap: null,
        marketCapCurrency: null,
        nav: null,
      });
    });
    if (!map.size) return empty("요청한 Hyperliquid 심볼이 상장 목록에 없습니다.");
    return ok(map);
  } catch (error) {
    return stale(error instanceof Error ? error.message : "Hyperliquid 수집 실패");
  }
}
