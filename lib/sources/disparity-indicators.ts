import { readFile } from "node:fs/promises";
import path from "node:path";
import { disparity, disparitySeries } from "@/lib/market/series";

const markets = [
  { id: "kospi", name: "KOSPI", source: "KRX 정보데이터시스템", basis: "KRX 정규장 15:30 KST" },
  { id: "kosdaq", name: "KOSDAQ", source: "KRX 정보데이터시스템", basis: "KRX 정규장 15:30 KST" },
  { id: "nasdaq", name: "NASDAQ 종합지수", source: "Yahoo Finance ^IXIC", basis: "미국 정규장 종가 · 뉴욕 거래일 (ET)" },
  { id: "sp500", name: "S&P 500", source: "Yahoo Finance ^GSPC", basis: "미국 정규장 종가 · 뉴욕 거래일 (ET)" },
] as const;

export async function loadDisparityIndicators() {
  return Promise.all(markets.map(async market => {
    try {
      const dir = path.join(process.cwd(), "public", "data", "market-indicators-live");
      const [raw, metaRaw] = await Promise.all([
        readFile(path.join(dir, `${market.id}.json`), "utf8"),
        readFile(path.join(dir, `${market.id}.meta.json`), "utf8"),
      ]);
      const points: unknown = JSON.parse(raw);
      const meta = JSON.parse(metaRaw);
      if (meta.status !== "ok" || meta.source !== market.source || meta.basis !== market.basis || !Array.isArray(points) || points.length < 50) throw new Error("invalid publication");
      let previous = "";
      const bars = points.map((point: { date: string; value: number }) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || point.date <= previous || !Number.isFinite(point.value) || point.value <= 0) throw new Error("invalid point");
        previous = point.date;
        return { date: point.date, close: point.value };
      });
      if (previous !== meta.asOf) throw new Error("inconsistent date");
      const closes = bars.map(bar => bar.close);
      return { ...market, asOf: previous, fetchedAt: meta.fetchedAt as string, latest25: disparity(closes, 25), latest50: disparity(closes, 50), series50: disparitySeries(bars, 50), error: false };
    } catch {
      return { ...market, asOf: null, fetchedAt: null, latest25: null, latest50: null, series50: [], error: true };
    }
  }));
}
