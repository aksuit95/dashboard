import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
const files = vi.hoisted(() => new Map<string, unknown>());
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async (file: string) => {
  const name = path.basename(file);
  if (!files.has(name)) throw new Error("missing publication");
  return JSON.stringify(files.get(name));
}) }));
import { loadRiskCharts } from "./risk-charts";

const now = new Date("2026-11-23T09:00:00+09:00");
const point = { date: "2026-11-20", value: 35.89 };
beforeEach(() => {
  files.clear();
  for (const [id, symbol] of [["vix", "^VIX"], ["sox", "^SOX"]]) {
    files.set(`${id}.json`, [point]);
    files.set(`${id}.meta.json`, { status: "ok", source: `Yahoo Finance ${symbol}`, basis: "미국 정규장 종가 · 뉴욕 거래일 (ET)", asOf: point.date, fetchedAt: "2026-11-23T00:00:00Z" });
  }
  for (const [id, years, value] of [["us10y", "10", 4.5], ["us2y", "2", 4]] as const) {
    files.set(`${id}.json`, [{ date: "2026-11-19", value }, { date: "2026-11-20", value }]);
    files.set(`${id}.meta.json`, { status: "ok", source: "미국 재무부", basis: `${years}년 만기 국채 파 수익률(%) · 뉴욕 약 15:30 호가 기준`, asOf: point.date, fetchedAt: "2026-11-23T00:00:00Z" });
  }
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("risk charts", () => {
  it("reads daily publications without Yahoo or the old cache and treats weekends as completed sessions", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const charts = await loadRiskCharts(now);
    expect(charts[0]).toMatchObject({ points: [point], asOf: point.date, error: null });
    expect(charts[1].error).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(charts[2].points.at(-1)).toEqual({ date: "2026-11-20", value: 0.5 });
  });

  it("warns on delayed data instead of presenting an old close as current", async () => {
    files.set("sox.json", [{ ...point, date: "2026-11-12" }]);
    files.set("sox.meta.json", { ...files.get("sox.meta.json") as object, asOf: "2026-11-12" });
    const charts = await loadRiskCharts(now);
    expect(charts[1].points).toHaveLength(1);
    expect(charts[1].error).toContain("2026-11-20");
    expect(charts[0].error).toBeNull();
  });

  it("retains the last validated series and collection time after collection fails", async () => {
    files.set("vix.meta.json", { ...files.get("vix.meta.json") as object, status: "error", checkedAt: "2026-11-24T00:00:00Z" });
    const [vix] = await loadRiskCharts(now);
    expect(vix.points).toEqual([point]);
    expect(vix.fetchedAt).toBe("2026-11-23T00:00:00Z");
    expect(vix.error).toContain("수집 실패");
  });

  it.each(["wrong-source", "wrong-date", "duplicate", "future"])("rejects an invalid publication: %s", async (kind) => {
    if (kind === "wrong-source") files.set("vix.meta.json", { ...files.get("vix.meta.json") as object, source: "Yahoo Finance ^SOX" });
    if (kind === "wrong-date") files.set("vix.meta.json", { ...files.get("vix.meta.json") as object, asOf: "2026-11-19" });
    if (kind === "duplicate") files.set("vix.json", [point, point]);
    if (kind === "future") files.set("vix.json", [{ ...point, date: "2026-11-23" }]);
    const [vix, sox] = await loadRiskCharts(now);
    expect(vix.points).toEqual([]);
    expect(vix.error).toBeTruthy();
    expect(sox.error).toBeNull();
  });
});
