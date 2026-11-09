import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { loadDisparityIndicators } from "./disparity-indicators";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const dates = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), value: 100 }));

describe("disparity publications", () => {
  it("calculates all four series and rejects an incorrect Korean price basis", async () => {
    vi.mocked(readFile).mockImplementation(async file => {
      const name = String(file);
      if (!name.endsWith(".meta.json")) return JSON.stringify(dates) as never;
      const kr = name.includes("kospi") || name.includes("kosdaq");
      return JSON.stringify({ status: "ok", source: kr ? "KRX 정보데이터시스템" : name.includes("nasdaq") ? "Yahoo Finance ^IXIC" : "Yahoo Finance ^GSPC", basis: name.includes("kospi") ? "통합 종가" : kr ? "KRX 정규장 15:30 KST" : "미국 정규장 종가 · 뉴욕 거래일 (ET)", asOf: dates.at(-1)?.date }) as never;
    });
    const result = await loadDisparityIndicators();
    expect(result[0]).toMatchObject({ error: true, latest50: null, series50: [] });
    for (const item of result.slice(1)) {
      expect(item).toMatchObject({ error: false, latest25: 100, latest50: 100, asOf: dates.at(-1)?.date });
      expect(item.series50).toHaveLength(11);
    }
  });
});
