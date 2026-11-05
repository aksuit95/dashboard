import { loadEnv } from "@/lib/env";
import { minerviniSession } from "@/lib/market/minervini-session";
import { fetchValuationMarketCaps, marketCapsPath, readMarketCaps } from "@/lib/valuation/market-caps";
import { atomicJson } from "@/lib/financials/source";
async function main() {
  loadEnv();
  const asOf = minerviniSession(), previous = await readMarketCaps();
  if (previous?.asOf === asOf) { console.log(`${asOf} 시총 저장 자료 유지`); return; }
  if (previous && previous.asOf > asOf) throw new Error("시총 기준일 역행");
  const data = await fetchValuationMarketCaps(asOf);
  await atomicJson(marketCapsPath, data);
  console.log(`${asOf} KRX 시총 ${Object.keys(data.values).length}종목 저장`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "시총 수집 실패"); process.exitCode = 1; });
