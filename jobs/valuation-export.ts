import fs from "node:fs";
import path from "node:path";
import { exportValuation } from "@/lib/valuation/export";

// Local-only inputs are never required by the Vercel build or runtime.
for (const name of [".env.local", ".env"]) {
  if (fs.existsSync(name)) process.loadEnvFile(name);
}

async function main() {
  const input = process.argv[2] || process.env.VALUATION_WORKBOOK_PATH;
  if (!input) throw new Error(".env.local의 VALUATION_WORKBOOK_PATH를 설정하거나 엑셀 경로를 인자로 전달해 주세요.");
  const output = path.resolve("data/valuation/kospi200.json");
  const { changed, snapshot } = await exportValuation(path.resolve(input), output);
  console.log(changed ? "밸류에이션 JSON을 갱신했습니다." : "변경된 데이터가 없습니다. 기존 JSON을 유지합니다.");
  console.log("출력: data/valuation/kospi200.json");
  for (const series of snapshot.data.series) console.log(`${series.name}: ${series.points.length}개 · 최신 ${series.points.at(-1)!.date}`);
  if (changed) console.log("로컬 차트와 git diff를 확인한 뒤 JSON을 코드와 함께 커밋·푸시하세요.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "내보내기에 실패했습니다.");
  process.exitCode = 1;
});
