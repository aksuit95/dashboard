import { setTimeout as sleep } from "node:timers/promises";
import { localDate } from "@/lib/market/market-hours";
import { recordMarketLiveArchive } from "@/lib/sources/market-live-archive";
import { exportMarketLivePublication } from "@/lib/sources/market-live-publication";
import { marketLiveTradingWindow } from "@/lib/sources/market-live";

const minute = 60_000;
const captureOffset = 8_000;

async function main() {
  const exportIndex = process.argv.indexOf("--export");
  if (exportIndex !== -1) {
    const directory = process.argv[exportIndex + 1];
    if (!directory) throw new Error("--export에 내보낼 폴더가 필요합니다.");
    const file = exportMarketLivePublication(directory);
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
  const window = marketLiveTradingWindow(localDate(now));
  if (!window || now >= window.closeAt) return;
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
}

main().catch(error => { console.error(error); process.exitCode = 1; });
