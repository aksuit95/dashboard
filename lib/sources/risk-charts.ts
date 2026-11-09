import { readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";

type Point = { date: string; value: number };
type ChartData = { id: string; name: string; basis: string; source: string; points: Point[]; asOf: string | null; fetchedAt: string | null; error: string | null };
const nyDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const nyHour = (date: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(date));

const usIndex = unstable_cache(async (symbol: string): Promise<{ points: Point[]; fetchedAt: string }> => {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y`, { cache: "no-store", signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error("시세 수집 실패");
  const result = (await response.json())?.chart?.result?.[0];
  if (result?.meta?.symbol !== symbol || !(["America/New_York", "America/Chicago"].includes(result?.meta?.exchangeTimezoneName)) || result?.meta?.instrumentType !== "INDEX") throw new Error("지수 정보 불일치");
  const stamps: number[] = result.timestamp, closes: (number | null)[] = result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(stamps) || !Array.isArray(closes) || stamps.length !== closes.length) throw new Error("일별 이력 오류");
  const now = new Date(), today = nyDate(now), seen = new Set<string>();
  const points = stamps.flatMap((stamp, i) => {
    const value = closes[i], date = nyDate(new Date(stamp * 1000));
    if (value == null || !Number.isFinite(value) || value <= 0 || date > today || (date === today && nyHour(now) < 17)) return [];
    if (seen.has(date)) throw new Error("날짜 중복");
    seen.add(date); return [{ date, value }];
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) throw new Error("완료된 종가 없음");
  return { points, fetchedAt: now.toISOString() };
}, ["risk-history-us-v1"], { revalidate: 3600 });

async function indexChart(id: string, name: string, symbol: string): Promise<ChartData> {
  const base = { id, name, basis: "미국 정규장 종가 · 뉴욕 거래일 (ET)", source: `Yahoo Finance ${symbol}` };
  try { const data = await usIndex(symbol); return { ...base, ...data, asOf: data.points.at(-1)!.date, error: null }; }
  catch { return { ...base, points: [], asOf: null, fetchedAt: null, error: "지수 이력을 불러오지 못했습니다." }; }
}
async function treasury(): Promise<ChartData> {
  const base = { id: "spread", name: "미국 장단기 금리차", basis: "미국 재무부 국채 파 수익률 · 뉴욕 약 15:30 호가 기준", source: "미국 재무부 · 10년 − 2년 (%p)" };
  try {
    const dir = path.join(process.cwd(), "public/data/market-indicators-live");
    const load = async (id: string, basis: string) => {
      const [raw, info] = await Promise.all([readFile(path.join(dir, `${id}.json`), "utf8"), readFile(path.join(dir, `${id}.meta.json`), "utf8")]);
      const meta = JSON.parse(info), points = JSON.parse(raw) as Point[];
      if (meta.status !== "ok" || meta.source !== "미국 재무부" || meta.basis !== basis || !Array.isArray(points) || !points.length) throw new Error("금리 출처 오류");
      let prev = "";
      for (const p of points) { if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || p.date <= prev || !Number.isFinite(p.value)) throw new Error("금리 데이터 오류"); prev = p.date; }
      if (prev !== meta.asOf) throw new Error("금리 기준일 오류");
      return { points, meta };
    };
    const [ten, two] = await Promise.all([load("us10y", "10년 만기 국채 파 수익률(%) · 뉴욕 약 15:30 호가 기준"), load("us2y", "2년 만기 국채 파 수익률(%) · 뉴욕 약 15:30 호가 기준")]);
    const shorter = new Map(two.points.map(p => [p.date, p.value]));
    const points = ten.points.flatMap(p => { const value = shorter.get(p.date); return value === undefined ? [] : [{ date: p.date, value: Math.round((p.value - value) * 10000) / 10000 }]; });
    if (!points.length) throw new Error("같은 날짜의 금리 없음");
    return { ...base, points, asOf: points.at(-1)!.date, fetchedAt: [ten.meta.fetchedAt, two.meta.fetchedAt].filter(Boolean).sort()[0] ?? null, error: null };
  } catch { return { ...base, points: [], asOf: null, fetchedAt: null, error: "같은 날짜의 미국 국채 금리 이력을 불러오지 못했습니다." }; }
}
export async function loadRiskCharts(): Promise<ChartData[]> {
  const [vix, sox, spread] = await Promise.all([indexChart("vix", "VIX", "^VIX"), indexChart("sox", "필라델피아 반도체", "^SOX"), treasury()]);
  return [vix, sox, spread];
}
