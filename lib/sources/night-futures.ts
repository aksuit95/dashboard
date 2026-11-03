import type { MarketCard } from "@/lib/sources/futures-board";

// Public night-session collection of KIS executions, not an estimated perpetual price.
// https://www.prekospi.com/methodology
export const NIGHT_FUTURES_URL = "https://www.prekospi.com/api/home";
const spec = {
  id: "K200-NIGHT", name: "코스피200 야간선물", symbol: "KOSPI200",
  venue: "KRX · 야간", unit: "points" as const,
  sourceName: "PreKOSPI · 한국투자증권 수집", sourceUrl: "https://www.prekospi.com/methodology",
  changeBasis: "야간 시가 대비",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseNightFuturesQuote(payload: unknown, now = new Date()): MarketCard | null {
  const root = record(payload);
  const row = record(root.futures);
  const session = record(row.session);
  if (root.ok !== true || !["night-session", "realtime"].includes(String(row.source))) return null;
  // A01 identifies KOSPI200 futures. Reject other instruments and missing timestamps.
  if (typeof row.symbol !== "string" || !/^A01[A-Z0-9]{3}$/.test(row.symbol)) return null;
  const price = finite(row.price);
  const open = finite(session.open);
  const ts = finite(row.ts);
  const start = finite(session.start);
  const end = finite(session.end);
  if (price == null || price <= 0 || open == null || open <= 0 || ts == null || start == null || end == null) return null;
  const startMs = start * 1000;
  const endMs = end * 1000;
  // The payload must identify an 18:00–06:00 KST night session and an execution within it.
  if (endMs - startMs !== 12 * 60 * 60 * 1000 || new Date(startMs).getUTCHours() !== 9
    || startMs % 3_600_000 !== 0 || ts < startMs || ts > endMs || ts > now.getTime() + 60_000) return null;
  const active = now.getTime() >= startMs && now.getTime() < endMs;
  const delayed = active && (now.getTime() - ts > 90_000 || session.isOpen !== true);
  const change = price - open;
  return {
    ...spec, symbol: row.symbol, price, change, changePct: change / open * 100,
    tradedAt: new Date(ts).toISOString(), delayed,
    session: active ? "open" : "closed",
    sessionNote: active ? (delayed ? "야간 시세 지연" : "야간 장중") : "마지막 야간 기록",
  };
}

export async function loadNightFutures(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<MarketCard> {
  try {
    const response = await fetchImpl(NIGHT_FUTURES_URL, {
      cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const quote = parseNightFuturesQuote(await response.json(), now);
    if (quote) return quote;
  } catch {
    // Keep a failed night feed distinct from the daytime close.
  }
  return { ...spec, price: null, change: null, changePct: null, session: "missing", error: "야간 체결 시세를 수신하지 못했습니다." };
}
