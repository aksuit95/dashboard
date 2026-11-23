import { readFile } from "node:fs/promises";
import path from "node:path";
import { usRefreshDate } from "@/lib/market/daily-close";

type Point = { date: string; value: number };
type ChartData = { id: string; name: string; basis: string; source: string; points: Point[]; asOf: string | null; fetchedAt: string | null; error: string | null };
async function indexChart(id: string, name: string, symbol: string, now: Date): Promise<ChartData> {
  const base = { id, name, basis: "미국 정규장 종가 · 뉴욕 거래일 (ET)", source: `Yahoo Finance ${symbol}` };
  try {
    const dir = path.join(process.cwd(), "public/data/market-indicators-live");
    const [raw, info] = await Promise.all([readFile(path.join(dir, `${id}.json`), "utf8"), readFile(path.join(dir, `${id}.meta.json`), "utf8")]);
    const points: Point[] = JSON.parse(raw), meta = JSON.parse(info);
    const expected = usRefreshDate(now);
    if (!["ok", "error"].includes(meta.status) || meta.source !== base.source || meta.basis !== base.basis
      || !Array.isArray(points) || !points.length || !Number.isFinite(Date.parse(meta.fetchedAt))) throw new Error("지수 메타데이터 오류");
    let previous = "";
    for (const p of points) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || p.date <= previous || p.date > expected || !Number.isFinite(p.value) || p.value <= 0) throw new Error("지수 이력 오류");
      previous = p.date;
    }
    if (previous !== meta.asOf) throw new Error("지수 기준일 불일치");
    const error = meta.status === "error" ? "최근 수집 실패 · 마지막으로 확인된 종가를 표시합니다."
      : previous < expected ? `갱신 지연 · ${expected} 종가가 아직 반영되지 않았습니다.` : null;
    return { ...base, points, asOf: previous, fetchedAt: meta.fetchedAt, error };
  }
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
export async function loadRiskCharts(now = new Date()): Promise<ChartData[]> {
  const [vix, sox, spread] = await Promise.all([indexChart("vix", "VIX", "^VIX", now), indexChart("sox", "필라델피아 반도체", "^SOX", now), treasury()]);
  return [vix, sox, spread];
}
