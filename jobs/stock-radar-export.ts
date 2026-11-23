import { loadEnv } from "@/lib/env";
import { atomicJson } from "@/lib/financials/source";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { addMarketCapsToLegacyRadar, collectStockRadar } from "@/lib/stock-radar/collection";
import { localDate } from "@/lib/market/market-hours";
import { radarCloseTime } from "@/lib/stock-radar/krx";
import { readStockRadar, stockRadarPath } from "@/lib/stock-radar/publication";

async function main() {
  loadEnv();
  const asOf = reviewedCloseSession(new Date(), 0);
  if (radarCloseTime(asOf) !== "15:30") {
    console.log(`${asOf} 특별 운영일 KRX 15:30 종가 결측 · 이전 저장본 유지`);
    return;
  }
  const force = process.argv.includes("--force");
  const previous = await readStockRadar();
  if (previous && previous.asOf > asOf) throw new Error("KRX 레이더 기준일 역행");
  if (!force && previous?.asOf === asOf && previous.source === "KRX_OPEN_API" && previous.version === 2) {
    console.log(`${asOf} KRX 레이더 저장본 유지`);
    return;
  }
  const snapshot = !force && previous?.version === 1 && previous.source === "NAVER_KRX_CLOSE" && previous.asOf === asOf && asOf === localDate(Date.now())
    ? await addMarketCapsToLegacyRadar(previous) : await collectStockRadar(asOf, force);
  if (previous?.asOf === asOf && previous.source === "KRX_OPEN_API" && snapshot.source !== "KRX_OPEN_API") {
    throw new Error(`${asOf} KRX 공식 저장본 유지 · 잠정본으로 변경 불가`);
  }
  await atomicJson(stockRadarPath, snapshot);
  const covered = snapshot.rows.filter(row => row.metrics["52w"]).length;
  console.log(`${asOf} ${snapshot.source} 보통주 ${snapshot.rows.length}종목 저장 · 52주 분석 ${covered}종목`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
