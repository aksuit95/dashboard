import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localDate } from "@/lib/market/market-hours";
import type { MarketLiveArchiveFrame, MarketLiveArchiveResponse } from "@/lib/market/market-live-archive";
import { calculateMarketLiveRadar } from "@/lib/market/market-live-rotation";
import { marketLiveTradingWindow } from "@/lib/market/market-live-session";
import type { MarketLiveRadar } from "@/lib/market/market-live";
import { isMarketLiveArchiveDate, readMarketLiveArchive, readMarketLiveRotationFrame } from "./market-live-archive";

export const marketLivePublicationDir = path.join(process.cwd(), "data", "market-live-publication");
const priceBasis = "KRX_REGULAR_CLOSE_1530_KST";
type PublishedArchive = {
  version: 1;
  market: "KRX";
  priceBasis: typeof priceBasis;
  day: NonNullable<MarketLiveArchiveResponse["day"]>;
  radar: MarketLiveRadar;
};

export function buildMarketLiveRadar(date: string, baselineDate: string, current: MarketLiveArchiveFrame, live: boolean, archiveFile?: string): MarketLiveRadar {
  return calculateMarketLiveRadar(date, baselineDate, current, live,
    (from, through) => readMarketLiveRotationFrame(date, baselineDate, from, through, archiveFile));
}

function publishedDates() {
  try {
    return readdirSync(marketLivePublicationDir).flatMap(file => {
      const date = file.slice(0, -5);
      return file.endsWith(".json") && isMarketLiveArchiveDate(date) ? [date] : [];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
}

export function readMarketLivePublication(date: string): PublishedArchive | null {
  if (!isMarketLiveArchiveDate(date)) return null;
  let saved: PublishedArchive;
  try {
    saved = JSON.parse(readFileSync(path.join(marketLivePublicationDir, `${date}.json`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return null;
  }
  const baseline = saved.day?.baselineDate;
  if (saved.version !== 1 || saved.market !== "KRX" || saved.priceBasis !== priceBasis || saved.day?.date !== date ||
      !isMarketLiveArchiveDate(baseline) || baseline >= date || !saved.day.frames?.length ||
      saved.radar?.date !== date || saved.radar.baselineDate !== baseline || saved.radar.live !== false) {
    throw new Error("저장된 KRX 섹터 기록의 기준을 확인할 수 없습니다.");
  }
  return saved;
}

export function readSharedMarketLiveArchive(date?: string, includeLocal = true): MarketLiveArchiveResponse {
  const local = includeLocal ? readMarketLiveArchive(date) : { dates: [], day: null };
  const dates = [...new Set([...local.dates, ...publishedDates()])].sort().reverse();
  const selected = date ?? dates[0];
  const day = local.day?.date === selected ? local.day : selected ? readMarketLivePublication(selected)?.day ?? null : null;
  return { dates, day };
}

/** Export only aggregate sectors and comparison results from the latest completed recorded session. */
export function exportMarketLivePublication(directory: string, now = Date.now(), archiveFile?: string) {
  const { dates } = readMarketLiveArchive(undefined, archiveFile);
  const today = localDate(now);
  const date = dates.find(date => {
    const window = marketLiveTradingWindow(date);
    return date <= today && window && window.closeAt <= now;
  });
  if (!date) return null;
  const { day } = readMarketLiveArchive(date, archiveFile);
  if (!day) return null;
  const current = readMarketLiveRotationFrame(date, day.baselineDate, 0, now, archiveFile);
  if (!current) return null;
  const snapshot: PublishedArchive = {
    version: 1, market: "KRX", priceBasis, day, radar: buildMarketLiveRadar(date, day.baselineDate, current, false, archiveFile),
  };
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${date}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(snapshot) + "\n", { flag: "wx" });
  renameSync(temporary, file);
  return file;
}
