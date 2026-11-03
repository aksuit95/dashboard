import type { PerpQuote } from "@/lib/sources/proxy-board";

export function parseHyperliquidLive(value: unknown, allowed: string[]): PerpQuote | null {
  if (!value || typeof value !== "object") return null;
  const message = value as { channel?: unknown; data?: { coin?: unknown; ctx?: Record<string, unknown> } };
  const coin = message.data?.coin, ctx = message.data?.ctx;
  if (message.channel !== "activeAssetCtx" || typeof coin !== "string" || !allowed.includes(coin) || !ctx || typeof ctx !== "object") return null;
  const read = (key: string): number | null => {
    const v = ctx[key];
    if ((typeof v !== "string" && typeof v !== "number") || String(v).trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const markUsd = read("markPx");
  if (markUsd == null || markUsd <= 0) return null;
  const volume = read("dayNtlVlm"), interest = read("openInterest");
  return { symbol: coin, markUsd, quoteVolumeUsd: volume != null && volume >= 0 ? volume : null,
    openInterest: interest != null && interest >= 0 ? interest : null, fundingHourly: read("funding") };
}
