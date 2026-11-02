import fs from "node:fs/promises";
import path from "node:path";
import { readValuationWorkbook } from "./xlsx";
import type { ValuationData } from "./types";

export type ValuationSnapshot = { schemaVersion: 1; exportedAt: string; data: ValuationData };

export async function exportValuation(input: string, output: string, now = new Date()) {
  const before = await fs.stat(input);
  if (before.size > 20 * 1024 * 1024) throw new Error("엑셀 파일은 20MB 이하여야 합니다.");
  const bytes = await fs.readFile(input);
  const data = await readValuationWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, path.basename(input), before.mtime.toISOString());
  const after = await fs.stat(input);
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw new Error("내보내는 도중 엑셀이 변경됐습니다. 저장 완료 후 다시 실행해 주세요.");
  if (data.warnings.length) throw new Error(`원본 검증에 실패했습니다. 기존 JSON은 유지합니다.\n${data.warnings.join("\n")}`);
  let previous: ValuationSnapshot | null = null;
  try { previous = JSON.parse(await fs.readFile(output, "utf8")) as ValuationSnapshot; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previous) {
    if (previous.schemaVersion !== 1 || !Array.isArray(previous.data?.series)) throw new Error("기존 JSON 형식이 올바르지 않습니다.");
    for (const old of previous.data.series) {
      const next = data.series.find((series) => series.id === old.id);
      if (!next) throw new Error(`${old.name}이 새 엑셀에서 누락됐습니다. 기존 JSON은 유지합니다.`);
      if (next.points.at(-1)!.date < old.points.at(-1)!.date) throw new Error(`${old.name}의 최신 날짜가 이전 데이터보다 과거입니다. 기존 JSON은 유지합니다.`);
    }
    if (JSON.stringify(previous.data) === JSON.stringify(data)) return { changed: false, snapshot: previous };
  }
  const snapshot: ValuationSnapshot = { schemaVersion: 1, exportedAt: now.toISOString(), data };
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, output);
  } finally { await fs.unlink(temporary).catch(() => undefined); }
  return { changed: true, snapshot };
}
