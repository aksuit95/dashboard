import type { AppDatabase } from "@/lib/db/client";

export const CNN_FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2021-02-01";
/** Daily refresh boundary: 01:00 UTC = 10:00 KST, after the US evening. */
export function fearGreedDay(now = new Date()): string {
  return new Date(now.getTime() - 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function nextFearGreedRefresh(now = new Date()): number {
  return Date.parse(`${fearGreedDay(now)}T01:00:00Z`) + 86_400_000;
}

export type FearGreedSnapshot = {
  score: number;
  asOf: string;
  previousClose: number | null;
  previousWeek: number | null;
  previousMonth: number | null;
  previousYear: number | null;
  points: { date: string; value: number }[];
};

export type FearGreedBoard = {
  snapshot: FearGreedSnapshot | null;
  fetchedAt: string | null;
  stale: boolean;
  error?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function score(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function fearGreedRating(value: number): string {
  if (value < 25) return "극단적 공포";
  if (value < 45) return "공포";
  if (value <= 55) return "중립";
  if (value <= 75) return "탐욕";
  return "극단적 탐욕";
}

/** CNN historical x values are epoch milliseconds; retain the UTC calendar date. */
export function parseFearGreed(payload: unknown): FearGreedSnapshot {
  const root = record(payload);
  const current = record(root.fear_and_greed);
  const value = score(current.score);
  const asOf = typeof current.timestamp === "string" ? new Date(current.timestamp) : new Date(NaN);
  const history = record(root.fear_and_greed_historical).data;
  if (value == null || !Number.isFinite(asOf.getTime()) || !Array.isArray(history)) {
    throw new Error("CNN 지수 응답 형식이 올바르지 않습니다.");
  }
  // Sort by timestamp before deduplicating: retain the last observation of each day.
  const observations = history.flatMap((item: unknown) => {
    const row = record(item);
    const y = score(row.y);
    const x = typeof row.x === "number" ? row.x : NaN;
    return y != null && Number.isFinite(x) && Number.isFinite(new Date(x).getTime()) ? [{ x, y }] : [];
  }).sort((a, b) => a.x - b.x);
  const days = new Map<string, number>();
  for (const point of observations) days.set(new Date(point.x).toISOString().slice(0, 10), point.y);
  if (!days.size) throw new Error("CNN 과거 지수 데이터가 없습니다.");
  // The live reading belongs to the US market date, regardless of the viewer's timezone.
  const marketDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(asOf);
  days.set(marketDate, value);
  return {
    score: value,
    asOf: asOf.toISOString(),
    previousClose: score(current.previous_close),
    previousWeek: score(current.previous_1_week),
    previousMonth: score(current.previous_1_month),
    previousYear: score(current.previous_1_year),
    points: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
  };
}

export function readFearGreed(db: AppDatabase): FearGreedBoard {
  const saved = db.prepare("SELECT payload, fetched_at FROM fear_greed_snapshot WHERE id = 1").get() as
    { payload: string; fetched_at: string } | undefined;
  return {
    snapshot: saved ? JSON.parse(saved.payload) as FearGreedSnapshot : null,
    fetchedAt: saved?.fetched_at ?? null,
    stale: false,
  };
}

export async function loadFearGreed(
  db: AppDatabase,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<FearGreedBoard> {
  const saved = readFearGreed(db);
  const snapshot = saved.snapshot;
  if (saved.fetchedAt && fearGreedDay(new Date(saved.fetchedAt)) === fearGreedDay(now)) {
    return saved;
  }
  try {
    const response = await fetchImpl(CNN_FEAR_GREED_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Origin: "https://www.cnn.com",
        Referer: "https://www.cnn.com/markets/fear-and-greed",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`CNN HTTP ${response.status}`);
    const fresh = parseFearGreed(await response.json());
    if (snapshot && Date.parse(fresh.asOf) < Date.parse(snapshot.asOf)) {
      throw new Error("CNN returned an older observation");
    }
    db.prepare(`INSERT INTO fear_greed_snapshot (id, payload, fetched_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at`)
      .run(JSON.stringify(fresh), now.toISOString());
    return { snapshot: fresh, fetchedAt: now.toISOString(), stale: false };
  } catch {
    return {
      snapshot, fetchedAt: saved.fetchedAt, stale: true,
      error: snapshot ? "CNN 연결 실패 · 마지막 수집값을 표시합니다." : "CNN 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
