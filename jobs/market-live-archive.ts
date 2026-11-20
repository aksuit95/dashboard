import { setTimeout as sleep } from "node:timers/promises";
import { localDate } from "@/lib/market/market-hours";
import { recordMarketLiveArchive } from "@/lib/sources/market-live-archive";
import { exportMarketLivePublication } from "@/lib/sources/market-live-publication";
import { loadMarketLiveBoard, marketLiveTradingWindow } from "@/lib/sources/market-live";
import { readMarketLiveClose, saveMarketLiveClose, withinClosingCapture } from "@/lib/sources/market-live-close";
import type { MarketLiveClosingSnapshot } from "@/lib/market/market-live";

const minute = 60_000;
const captureOffset = 8_000;

async function captureClose(date: string, closeAt: number) {
  if (readMarketLiveClose(date)) return;
  let best: MarketLiveClosingSnapshot | undefined;
  for (const delay of [Math.max(0, closeAt + captureOffset - Date.now()), 17_000, 20_000]) {
    if (!withinClosingCapture(Date.now() + delay, closeAt)) break;
    if (delay) await sleep(delay);
    const board = await loadMarketLiveBoard().catch(() => null);
    const snapshot = board?.closingSnapshot;
    if (snapshot?.date !== date) continue;
    if (!best || snapshot.stocks.length > best.stocks.length) best = snapshot;
    if (snapshot.stocks.length === board?.breadth.total) break;
  }
  if (best) {
    saveMarketLiveClose(best);
    console.log(`${best.collectedAt} KRX 정규장 마감 거래대금 저장 · ${date} · ${best.stocks.length}종목`);
  }
}

async function main() {
  const exportIndex = process.argv.indexOf("--export");
  if (exportIndex !== -1) {
    const directory = process.argv[exportIndex + 1];
    if (!directory) throw new Error("--export에 내보낼 폴더가 필요합니다.");
    const file = await exportMarketLivePublication(directory);
    if (file) console.log(file);
    return;
  }
  if (!process.argv.includes("--watch")) {
    const result = await recordMarketLiveArchive();
    console.log(JSON.stringify(result));
    if (result.status === "missing") process.exitCode = 1;
    return;
  }

  const now = Date.now();
  const date = localDate(now);
  const window = marketLiveTradingWindow(date);
  if (!window || (now >= window.closeAt && !withinClosingCapture(now, window.closeAt))) return;
  if (now < window.openAt + captureOffset) await sleep(window.openAt + captureOffset - now);

  let lastError: string | null = null;
  let lastReport = 0;
  while (Date.now() < window.closeAt) {
    const now = Date.now();
    let error: string | null = null;
    try {
      const result = await recordMarketLiveArchive({ now });
      if (result.status === "missing") error = result.reason;
      if (result.status === "recorded" && (now - lastReport >= 15 * minute || lastError != null)) {
        console.log(`${result.collectedAt} 섹터 기록 저장 · ${result.date} KRX · ${result.stocks}종목`);
        lastReport = now;
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : "섹터 기록 수집 실패";
    }
    if (error && error !== lastError) console.error(`${new Date().toISOString()} ${error}`);
    lastError = error;

    const after = Date.now();
    const next = (Math.floor((after - captureOffset) / minute) + 1) * minute + captureOffset;
    if (next >= window.closeAt) break;
    await sleep(next - after);
  }
  try {
    await captureClose(date, window.closeAt);
  } catch (failure) {
    console.error(`${new Date().toISOString()} KRX 마감 거래대금 저장 실패`, failure);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
