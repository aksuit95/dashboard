import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { exportStockValuation } from "./stock-export";

it("개별종목 XLSX를 내보내고 반복 내보내기와 오류 발생 시 기존 스냅샷을 보존한다", async () => {
  const directory = await fs.mkdtemp(path.resolve("tmp/stock-export-test-"));
  const file = path.join(directory, "stocks.xlsx");
  const output = path.join(directory, "stocks.json");
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("종목별 밸류에이션").addRows([
      ["Composition Date", "CPD [20261102]"],
      [null, "Account", "E382160.M"],
      [null, "Unit", "X"],
      [null, "Base Date", "CPD-1TD"],
      ["Code", "Name", "PER"],
      ["A005930", "삼성전자", 3.32],
    ]);
    await workbook.xlsx.writeFile(file);
    const first = await exportStockValuation(file, output);
    expect(first.snapshot.data.stocks[0].values.per).toBe(3.32);
    const bytes = await fs.readFile(output, "utf8");
    expect((await exportStockValuation(file, output)).changed).toBe(false);
    expect(await fs.readFile(output, "utf8")).toBe(bytes);
    workbook.worksheets[0].getCell("B1").value = "CPD [20261030]";
    await workbook.xlsx.writeFile(file);
    await expect(exportStockValuation(file, output)).rejects.toThrow("과거");
    await fs.writeFile(file, "partial save");
    await expect(exportStockValuation(file, output)).rejects.toThrow();
    expect(await fs.readFile(output, "utf8")).toBe(bytes);
  } finally {
    await fs.unlink(file).catch(() => undefined);
    await fs.unlink(output).catch(() => undefined);
    await fs.rmdir(directory);
  }
});
