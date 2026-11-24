import { loadEnv } from "@/lib/env";
import { atomicJson } from "@/lib/financials/source";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { krxCloseTime } from "@/config/market-calendar";
import { collectIndexBars, indexBarsPath, readIndexBars } from "@/lib/sources/index-bars";

async function main() {
  loadEnv();
  const asOf = reviewedCloseSession();
  if (krxCloseTime(asOf) !== "15:30") return;
  const previous = await readIndexBars();
  const result = await collectIndexBars(asOf, previous);
  if (result !== previous) await atomicJson(indexBarsPath, result);
  console.log(`${asOf} KRX 코스피·코스닥 일봉 저장`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "KRX 일봉 수집 실패"); process.exitCode = 1; });
