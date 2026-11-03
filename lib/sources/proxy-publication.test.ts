import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportProxyPublication, publishedProxyClose, readProxyPublication } from "./proxy-publication";

let dir: string, file: string;
const codes = ["005930", "005935", "000660"];
const prices: Record<string, number> = { "005930": 100, "005935": 80, "000660": 100000 };
const krx = vi.fn(async (_service: string, date: string) => codes.map(ISU_CD => ({ ISU_CD, BAS_DD: date, TDD_CLSPRC: String(prices[ISU_CD]) })));
const history = vi.fn(async (code: string, through: string) => [{ date: through, close: prices[code] }]);
const yahoo = vi.fn(async (symbol: string) => ({ status: "ok" as const, data: [
  { date: "2026-10-30", close: symbol === "SKHY" ? 8 : 1400 },
  { date: "2026-11-02", close: symbol === "SKHY" ? 9 : 1410 },
  { date: "2026-11-03", close: 9999 },
] }));
const dep = { krx, history, yahoo } as unknown as Parameters<typeof exportProxyPublication>[2];
beforeEach(async () => { vi.clearAllMocks(); const root = path.join(process.cwd(), "tmp"); await fs.mkdir(root, { recursive: true }); dir = await fs.mkdtemp(path.join(root, "proxy-publication-")); file = path.join(dir, "board.json"); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe("published proxy close", () => {
  it("updates US at 07:00 while reusing KRX 15:30 data", async () => {
    await exportProxyPublication(file, new Date("2026-11-03T06:59:00+09:00"), dep);
    expect((await publishedProxyClose(file)).adr.at(-1)).toMatchObject({ date: "2026-11-02", adrDate: "2026-10-30" });
    await exportProxyPublication(file, new Date("2026-11-03T07:00:00+09:00"), dep);
    const result = await publishedProxyClose(file);
    expect(result.adr.at(-1)).toMatchObject({ date: "2026-11-02", adrDate: "2026-11-02", fxDate: "2026-11-02", adrPerShareKrw: 126900 });
    expect(result.samsung.at(-1)).toMatchObject({ date: "2026-11-02", value: 20 });
    expect(krx).toHaveBeenCalledTimes(1);
    expect((await exportProxyPublication(file, new Date("2026-11-03T08:00:00+09:00"), dep)).changed).toBe(false);
  });
  it("preserves old publication if a KRX close is missing or inconsistent", async () => {
    await exportProxyPublication(file, new Date("2026-11-03T07:00:00+09:00"), dep);
    const old = await fs.readFile(file, "utf8");
    krx.mockResolvedValueOnce([{ ISU_CD: "005930", BAS_DD: "20261103", TDD_CLSPRC: "100" }]);
    await expect(exportProxyPublication(file, new Date("2026-11-03T16:00:00+09:00"), dep)).rejects.toThrow("종가 누락");
    expect(await fs.readFile(file, "utf8")).toBe(old);
    expect((await readProxyPublication(file))?.krAsOf).toBe("2026-11-02");
  });
});
