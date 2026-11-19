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
  for (const [indexCode, file] of [["IKS200", "kospi200.json"], ["IKQ150", "kosdaq150.json"]] as const) {
    const { changed, snapshot } = await exportValuation(path.resolve(input), path.resolve("data/valuation", file), new Date(), indexCode);
    console.log(`${indexCode} ${changed ? "갱신" : "변경 없음"} · ${file}`);
    for (const series of snapshot.data.series) console.log(`${series.name}: ${series.points.length}개 · 최신 ${series.points.at(-1)!.date}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "내보내기에 실패했습니다.");
  process.exitCode = 1;
});
