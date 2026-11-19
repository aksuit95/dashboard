import fs from "node:fs";
import path from "node:path";
import { exportStockValuation } from "@/lib/valuation/stock-export";

for (const name of [".env.local", ".env"]) {
  if (fs.existsSync(name)) process.loadEnvFile(name);
}
async function main() {
  const input = process.argv[2] || process.env.STOCK_VALUATION_WORKBOOK_PATH || process.env.VALUATION_WORKBOOK_PATH;
  if (!input) throw new Error("VALUATION_WORKBOOK_PATH를 설정하거나 엑셀 경로를 인자로 전달해 주세요.");
  for (const [indexCode, file] of [["IKS200", "stocks.json"], ["IKQ150", "kosdaq150-stocks.json"]] as const) {
    const { changed, snapshot } = await exportStockValuation(path.resolve(input), path.resolve("data/valuation", file), new Date(), indexCode);
    console.log(`${indexCode} ${changed ? "갱신" : "변경 없음"} · ${snapshot.data.stocks.length}종목 · 구성일 ${snapshot.data.compositionDate}`);
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "내보내기에 실패했습니다."); process.exitCode = 1; });
