import { loadEnv } from "@/lib/env";
import { atomicJson } from "@/lib/financials/source";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { addMarketCapsToLegacyRadar, collectStockRadar } from "@/lib/stock-radar/collection";
import { localDate } from "@/lib/market/market-hours";
import { radarCloseTime } from "@/lib/stock-radar/krx";
import { readStockRadar, stockRadarPath } from "@/lib/stock-radar/publication";
import { publishIndexBreadth } from "@/lib/sources/index-breadth";

async function main() {
  loadEnv();
  const asOf = reviewedCloseSession(new Date(), 0);
  if (radarCloseTime(asOf) !== "15:30") {
    console.log(`${asOf} 특별 운영일 KRX 15:30 종가 결측 · 이전 저장본 유지`);
    return;
  }
  const force = process.argv.includes("--force");
  const useKrxWeb = process.argv.includes("--krx-web");
  const useWebFallback = process.argv.includes("--krx-web-fallback");
  const previous = await readStockRadar();
  if (previous && previous.asOf > asOf) throw new Error("KRX 레이더 기준일 역행");
  if (!force && previous?.asOf === asOf && previous.source === "KRX_OPEN_API" && previous.version === 2 && previous.aboveSma20) {
    await publishIndexBreadth(previous);
    console.log(`${asOf} KRX 레이더 저장본 유지`);
    return;
  }
  const snapshot = !force && !useKrxWeb && previous?.version === 1 && previous.source === "NAVER_KRX_CLOSE" && previous.asOf === asOf && asOf === localDate(Date.now())
    ? await addMarketCapsToLegacyRadar(previous) : await collectStockRadar(asOf, { force, useKrxWeb, useWebFallback });
  if (previous?.asOf === asOf &&
      ((previous.source === "KRX_OPEN_API" && snapshot.source !== "KRX_OPEN_API") ||
       (previous.source === "KRX_WEB_VERIFIED" && snapshot.source === "NAVER_KRX_CLOSE"))) {
    throw new Error(`${asOf} 기존 검증된 KRX 저장본 유지`);
  }
  const unchanged = !force && previous?.asOf === snapshot.asOf && previous.source === snapshot.source &&
    JSON.stringify(previous) === JSON.stringify({ ...snapshot, fetchedAt: previous.fetchedAt });
  if (unchanged) {
    await publishIndexBreadth(previous);
    console.log(`${asOf} ${previous.source} 검증 완료 · 변경 없음`);
    return;
  }
  await atomicJson(stockRadarPath, snapshot);
  await publishIndexBreadth(snapshot);
  const covered = snapshot.rows.filter(row => row.metrics["52w"]).length;
  console.log(`${asOf} ${snapshot.source} 보통주 ${snapshot.rows.length}종목 저장 · 52주 분석 ${covered}종목`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
