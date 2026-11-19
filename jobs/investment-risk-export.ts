import { loadEnv } from "@/lib/env";
import { reviewedCloseSession as minerviniSession } from "@/lib/market/reviewed-close-session";
import { atomicJson } from "@/lib/financials/source";
import { collectRiskPrices, readRiskPrices, riskPricePath } from "@/lib/investment-risk/history";

async function main() {
  loadEnv();
  const asOf = minerviniSession();
  const previous = await readRiskPrices();
  const savedDate = previous?.days.at(-1)?.date;
  if (savedDate === asOf && previous?.latestMarket && Array.isArray(previous.verifiedCandidates)) return;
  if (savedDate && savedDate > asOf) throw new Error("KRX 급등 자료 기준일 역행");
  const history = await collectRiskPrices(asOf, previous);
  await atomicJson(riskPricePath, history);
  console.log(`${asOf} KRX 급등 비교 종가 ${history.days.length}거래일 저장`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "KRX 급등 비교 종가 수집 실패"); process.exitCode = 1; });
