import { parseValuationSheets, type SourceSheet } from "./parse";

export async function readValuationWorkbook(buffer: ArrayBuffer, name: string, savedAt: string) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets: SourceSheet[] = [];
  workbook.eachSheet((sheet) => {
    if (sheet.rowCount > 100_000 || sheet.columnCount > 1_000) throw new Error("엑셀 조회 범위가 너무 큽니다. 코스피200 조회표만 포함한 파일을 연결해 주세요.");
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const value = cell.value;
        values[col - 1] = value && typeof value === "object" && "formula" in value ? value.result : value;
      });
      rows.push(values);
    });
    sheets.push({ name: sheet.name, rows });
  });
  return parseValuationSheets(sheets, name, savedAt);
}
