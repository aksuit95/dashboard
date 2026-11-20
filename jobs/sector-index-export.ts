import { loadEnv } from "@/lib/env";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { atomicJson } from "@/lib/financials/source";
import { collectIndexPublication, indexPath } from "@/lib/sources/sector-index";
async function main() {
  loadEnv();
  const asOf = reviewedCloseSession();
  const data = await collectIndexPublication(asOf);
  await atomicJson(indexPath, data);
  console.log(`${asOf} KRX 코스피200·코스닥150 지수 수집 완료`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : "지수 수집 실패"); process.exitCode = 1; });
