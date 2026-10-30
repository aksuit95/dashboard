export type CsvResult<T> = { ok: true; rows: T[] } | { ok: false; reason: string };

export function parseCsv(text: string): { header: string[]; rows: string[][] } | { error: string } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return { error: "헤더와 데이터 행이 필요합니다." };
  const header = splitCsvLine(lines[0]).map((cell) => cell.trim());
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function headerMatches(header: string[], expected: string[]): boolean {
  return expected.every((name, index) => header[index] === name);
}

export function numberCell(value: string, label: string): number | { error: string } {
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return { error: `${label} 숫자가 아닙니다: ${value}` };
  return parsed;
}
