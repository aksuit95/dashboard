import type { DailyBarPayload } from "@/lib/sources/types";

export type PreferredDiscountPoint = {
  date: string;
  value: number;
  commonKrw: number;
  preferredKrw: number;
};

/** 같은 거래일 종가로 보통주 대비 우선주 할인율을 계산한다. */
export function preferredDiscountSeries(common: DailyBarPayload[], preferred: DailyBarPayload[]): PreferredDiscountPoint[] {
  const validCloses = (bars: DailyBarPayload[]) => new Map(bars
    .filter((bar) => bar.date && Number.isFinite(bar.close) && bar.close > 0)
    .map((bar) => [bar.date, bar.close]));
  const commonCloses = validCloses(common);
  const preferredCloses = validCloses(preferred);
  const points: PreferredDiscountPoint[] = [];
  for (const [date, commonKrw] of commonCloses) {
    const preferredKrw = preferredCloses.get(date);
    if (preferredKrw == null) continue;
    points.push({ date, commonKrw, preferredKrw, value: ((commonKrw - preferredKrw) / commonKrw) * 100 });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
