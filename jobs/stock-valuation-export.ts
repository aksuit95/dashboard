import fs from "node:fs";
import path from "node:path";
import { exportStockValuation } from "@/lib/valuation/stock-export";

for (const name of [".env.local", ".env"]) {
  if (fs.existsSync(name)) process.loadEnvFile(name);
}
async function main() {
  const input = process.argv[2] || process.env.STOCK_VALUATION_WORKBOOK_PATH || process.env.VALUATION_WORKBOOK_PATH;
  if (!input) throw new Error("VALUATION_WORKBOOK_PATH를 설정하거나 엑셀 경로를 인자로 전달해 주세요.");
  const { changed, snapshot } = await exportStockValuation(path.resolve(input), path.resolve("data/valuation/stocks.json"));
  console.log(changed ? "개별종목 밸류에이션 JSON을 갱신했습니다." : "변경된 데이터가 없습니다. 기존 JSON을 유지합니다.");
  console.log(`출력: data/valuation/stocks.json · ${snapshot.data.stocks.length}종목 · 구성일 ${snapshot.data.compositionDate}`);
  console.log("조회일 이력: data/valuation/stock-history.json · 배포 시 stocks.json과 함께 반영하세요.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "내보내기에 실패했습니다."); process.exitCode = 1; });
