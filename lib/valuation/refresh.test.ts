import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/valuation/route";
import { exportValuation } from "./export";

const created: { directory: string; file: string; output: string }[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const { file, directory, output } of created.splice(0)) {
    await fs.unlink(file).catch(() => undefined);
    await fs.unlink(output).catch(() => undefined);
    await fs.rmdir(directory);
  }
});

async function writeFixture(file: string, value: number, seconds: number, date = "2026-10-30", includePbr = false) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("QuantiWise");
  sheet.addRows([
    ["Code", "IKS200", ...(includePbr ? ["IKS200"] : [])],
    ["Item Code", "E382160.M", ...(includePbr ? ["E382560.M"] : [])],
    ["Unit", "X", ...(includePbr ? ["X"] : [])],
    ["D A T E", "P/E(Fwd.12M)", ...(includePbr ? ["P/B(Fwd.12M)"] : [])],
    [new Date(`${date}T00:00:00Z`), value, ...(includePbr ? [1.2] : [])],
  ]);
  sheet.getCell("A5").numFmt = "yyyy-mm-dd";
  await workbook.xlsx.writeFile(file);
  await fs.utimes(file, seconds, seconds);
}

async function fixture() {
  const temporaryRoot = path.resolve("tmp");
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, "valuation-export-"));
  const entry = { directory, file: path.join(directory, "valuation.xlsx"), output: path.join(directory, "snapshot.json") };
  created.push(entry);
  return entry;
}

describe("엑셀에서 배포 JSON 내보내기", () => {
  it("실제 XLSX를 JSON으로 변환하고 같은 파일을 다시 내보내면 바이트와 시각이 그대로다", async () => {
    const { file, output, directory } = await fixture();
    await writeFixture(file, 10, 1000);
    const first = await exportValuation(file, output, new Date("2026-11-02T06:00:00Z"));
    expect(first.changed).toBe(true);
    expect(first.snapshot.data.series[0].points).toEqual([{ date: "2026-10-30", value: 10 }]);
    const original = await fs.readFile(output, "utf8");
    expect((await exportValuation(file, output, new Date("2026-11-03T06:00:00Z"))).changed).toBe(false);
    expect(await fs.readFile(output, "utf8")).toBe(original);
    await writeFixture(file, 12, 2000);
    expect((await exportValuation(file, output)).snapshot.data.series[0].points[0].value).toBe(12);
    expect((await fs.readdir(directory)).sort()).toEqual(["snapshot.json", "valuation.xlsx"]);
  });

  it("손상된 엑셀을 내보내면 기존 JSON을 바꾸지 않는다", async () => {
    const { file, output } = await fixture();
    await writeFixture(file, 10, 1000);
    await exportValuation(file, output);
    const original = await fs.readFile(output, "utf8");
    await fs.writeFile(file, "partial save");
    await expect(exportValuation(file, output)).rejects.toThrow();
    expect(await fs.readFile(output, "utf8")).toBe(original);
  });

  it("기존 지표 누락과 데이터 기준일 역행을 차단한다", async () => {
    const { file, output } = await fixture();
    await writeFixture(file, 10, 1000, "2026-10-30", true);
    await exportValuation(file, output);
    const original = await fs.readFile(output, "utf8");
    await writeFixture(file, 10, 2000, "2026-10-30");
    await expect(exportValuation(file, output)).rejects.toThrow("누락");
    await writeFixture(file, 10, 3000, "2026-10-29", true);
    await expect(exportValuation(file, output)).rejects.toThrow("과거");
    expect(await fs.readFile(output, "utf8")).toBe(original);
  });

  it("Vercel에서는 로컬 파일 경로 없이 포함된 JSON을 응답한다", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VALUATION_WORKBOOK_PATH", "Z:/not-present/workbook.xlsx");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.series.length).toBeGreaterThan(0);
    expect(body.exportedAt).toMatch(/^\d{4}-/);
    expect(JSON.stringify(body)).not.toContain("Z:/");
  });
});
