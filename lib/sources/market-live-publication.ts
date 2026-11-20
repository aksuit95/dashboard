import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { minerviniUniverseIds } from "@/config/minervini";
import { localDate } from "@/lib/market/market-hours";
import type { MarketLiveArchiveFrame, MarketLiveArchiveResponse } from "@/lib/market/market-live-archive";
import { calculateMarketLiveRadar } from "@/lib/market/market-live-rotation";
import { marketLiveCloseBasis, marketLiveTradingWindow } from "@/lib/market/market-live-session";
import type { MarketLiveClosingSnapshot, MarketLiveRadar } from "@/lib/market/market-live";
import { isMarketLiveArchiveDate, readMarketLiveArchive, readMarketLiveRotationFrame } from "./market-live-archive";
import { readMarketLiveClose, validMarketLiveClose } from "./market-live-close";
import { readSectorPublication } from "./sector-publication";

export const marketLivePublicationDir = path.join(process.cwd(), "data", "market-live-publication");
type PublishedArchive = {
  version: 1;
  market: "KRX";
  priceBasis: ReturnType<typeof marketLiveCloseBasis>;
  day: NonNullable<MarketLiveArchiveResponse["day"]>;
  radar: MarketLiveRadar;
  closingSnapshot?: MarketLiveClosingSnapshot;
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
  if (saved.version !== 1 || saved.market !== "KRX" || saved.day?.date !== date ||
      !isMarketLiveArchiveDate(baseline) || baseline >= date || saved.priceBasis !== marketLiveCloseBasis(baseline) || !saved.day.frames?.length ||
      saved.radar?.date !== date || saved.radar.baselineDate !== baseline || saved.radar.live !== false) {
    throw new Error("저장된 KRX 섹터 기록의 기준을 확인할 수 없습니다.");
  }
  return saved;
}

export async function marketLiveReplayNames(date?: string): Promise<Map<string, string>> {
  const source = await readSectorPublication().catch(() => null);
  return new Map(minerviniUniverseIds.flatMap(universe => {
    const snapshots = source?.snapshots[universe];
    const selected = Object.keys(snapshots ?? {}).sort().findLast(day => !date || day <= date);
    return selected ? snapshots?.[selected].rows.map(row => [row.code, row.name] as const) ?? [] : [];
  }));
}

export async function readSharedMarketLiveArchive(date?: string, includeLocal = true): Promise<MarketLiveArchiveResponse> {
  const local = includeLocal ? readMarketLiveArchive(date, undefined, await marketLiveReplayNames(date)) : { dates: [], day: null };
  const dates = [...new Set([...local.dates, ...publishedDates()])].sort().reverse();
  const selected = date ?? dates[0];
  const day = local.day?.date === selected ? local.day : selected ? readMarketLivePublication(selected)?.day ?? null : null;
  return { dates, day };
}

/** Export the latest completed session, including the captured per-stock replay samples. */
export async function exportMarketLivePublication(directory: string, now = Date.now(), archiveFile?: string) {
  const { dates } = readMarketLiveArchive(undefined, archiveFile);
  const today = localDate(now);
  const date = dates.find(date => {
    const window = marketLiveTradingWindow(date);
    return date <= today && window && window.closeAt <= now;
  });
  if (!date) return null;
  const published = readMarketLivePublication(date);
  const { day } = readMarketLiveArchive(date, archiveFile, await marketLiveReplayNames(date));
  if (!day) return null;
  const current = readMarketLiveRotationFrame(date, day.baselineDate, 0, now, archiveFile);
  if (!current) return null;
  const closingSnapshot = published?.closingSnapshot ?? validMarketLiveClose(readMarketLiveClose(date, archiveFile), date, day.baselineDate) ?? undefined;
  const snapshot: PublishedArchive = published?.day.stockTape ? { ...published, closingSnapshot } : {
    version: 1, market: "KRX", priceBasis: marketLiveCloseBasis(day.baselineDate), day,
    radar: buildMarketLiveRadar(date, day.baselineDate, current, false, archiveFile),
    closingSnapshot,
  };
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${date}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(snapshot) + "\n", { flag: "wx" });
  renameSync(temporary, file);
  return file;
}
