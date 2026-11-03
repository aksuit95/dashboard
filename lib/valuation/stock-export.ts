import fs from "node:fs/promises";
import path from "node:path";
import { readWorkbookSheets } from "./xlsx";
import { parseStockValuation, type StockValuationSnapshot } from "./stocks";

export async function exportStockValuation(input: string, output: string, now = new Date()) {
  const before = await fs.stat(input);
  if (before.size > 20 * 1024 * 1024) throw new Error("엑셀 파일은 20MB 이하여야 합니다.");
  const bytes = await fs.readFile(input);
  const sheets = await readWorkbookSheets(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const data = parseStockValuation(sheets, path.basename(input), before.mtime.toISOString());
  const after = await fs.stat(input);
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw new Error("내보내는 도중 엑셀이 변경됐습니다. 저장 완료 후 다시 실행해 주세요.");
  let previous: StockValuationSnapshot | null = null;
  try { previous = JSON.parse(await fs.readFile(output, "utf8")) as StockValuationSnapshot; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previous) {
    if (previous.schemaVersion !== 1 || !previous.data?.stocks?.length || !previous.data.metrics?.length) throw new Error("기존 개별종목 JSON 형식이 올바르지 않습니다.");
    if (data.compositionDate < previous.data.compositionDate) throw new Error("종목 구성 기준일이 이전보다 과거입니다. 기존 JSON을 유지합니다.");
    for (const metric of previous.data.metrics) {
      if (!data.metrics.some(next => next.id === metric.id)) throw new Error(`${metric.id} 항목이 누락됐습니다. 기존 JSON을 유지합니다.`);
    }
    if (data.compositionDate === previous.data.compositionDate && previous.data.stocks.some(stock => !data.stocks.some(next => next.code === stock.code))) throw new Error("동일 구성일의 종목이 누락됐습니다. 기존 JSON을 유지합니다.");
    if (JSON.stringify(previous.data) === JSON.stringify(data)) return { changed: false, snapshot: previous };
  }
  const snapshot: StockValuationSnapshot = { schemaVersion: 1, exportedAt: now.toISOString(), data };
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, output);
  } finally { await fs.unlink(temporary).catch(() => undefined); }
  return { changed: true, snapshot };
}
