import { loadEnv } from "@/lib/env";
import { minerviniSession } from "@/lib/market/minervini-session";
import { atomicJson } from "@/lib/financials/source";
import { collectStockReturns, readStockReturns, stockReturnsPath } from "@/lib/stock-returns/publication";
async function main() {
  loadEnv();
  const asOf = minerviniSession(), previous = await readStockReturns();
  if (previous?.asOf === asOf && !process.argv.includes("--force")) { console.log(`${asOf} 종목 등락률 유지`); return; }
  if (previous && previous.asOf > asOf) throw new Error("KRX 기준일 역행");
  const publication = await collectStockReturns(asOf);
  await atomicJson(stockReturnsPath, publication);
  console.log(`${asOf} 종목 등락률 ${publication.markets.kospi.length + publication.markets.kosdaq.length}종목 저장`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
