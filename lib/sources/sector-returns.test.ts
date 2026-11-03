import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "@/lib/db/client";
import { fetchSectorSnapshot, parseIndustryGroups, sectorSnapshotVersion, type SectorSnapshot } from "./sector-returns";
import { loadSectors, loadSectorsAtDate, readSectors, saveSectors } from "./sector-returns-daily";

const now = new Date("2026-11-02T08:00:00Z");
const dbs: AppDatabase[] = [];
const db = () => { const d = openDatabase(":memory:"); dbs.push(d); return d; };
afterEach(() => { dbs.splice(0).forEach(d => d.close()); });
function upstream(universe = "kospi200", old = false) {
  return vi.fn<typeof fetch>().mockImplementation(async url => {
    const u = new URL(String(url));
    if (u.pathname.includes("enrollStock")) {
      const page = Number(u.searchParams.get("page"));
      const count = universe === "kospi200" && page === 4 ? 40 : 50;
      return Response.json({ isSuccess: true, result: { hasNext: page < (universe === "kospi200" ? 4 : 3), stocks: Array.from({ length: count }, (_, i) => ({ itemCode: String(((page - 1) * 50 + i + 1) * 10).padStart(6, "0"), name: "테스트", marketType: universe === "kospi200" ? "KOSPI" : "KOSDAQ", stockEndType: "stock", marketValue: 1e12, tradableStatus: "tradable" })) } });
    }
    if (u.pathname.endsWith("/industry")) return Response.json({ groups: [{ no: 278, name: "반도체와반도체장비" }], totalCount: 1 });
    if (u.pathname.endsWith("/integration")) return Response.json({ itemCode: u.pathname.split("/")[3], industryCode: "278" });
    if (old) return Response.json({ hasNext: false, items: [{ tradingDateKst: "2026-10-30", regularMarketClosingPrice: "100", closingPrice: "300" }] });
    return Response.json({ hasNext: false, items: [
      { tradingDateKst: "2026-11-03", regularMarketClosingPrice: "999", closingPrice: "999" },
      { tradingDateKst: "2026-11-02", regularMarketClosingPrice: "110", closingPrice: "300" },
      { tradingDateKst: "2026-10-30", regularMarketClosingPrice: "100", closingPrice: "200" },
    ] });
  });
}
describe("섹터 수집과 일별 저장", () => {
  it("불완전한 업종 목록을 거절한다", () => {
    expect(() => parseIndustryGroups({ groups: [{ no: 1, name: "기계" }], totalCount: 2 })).toThrow();
    expect(() => parseIndustryGroups({ groups: [{ no: 1, name: "기계" }, { no: 1, name: "기계" }], totalCount: 2 })).toThrow();
  });
  it("두 지수 전체를 독립적으로 수집하고 같은 날짜의 동시·반복 요청을 재사용한다", async () => {
    const d = db(); const kospi = upstream(); const kosdaq = upstream("kosdaq150");
    const [a, b, c] = await Promise.all([loadSectors(d, now, kospi), loadSectors(d, now, kospi), loadSectors(d, now, kosdaq, "kosdaq150")]);
    expect(a).toEqual(b);
    expect(a.stale).toBe(false);
    expect(a.snapshot?.rows).toHaveLength(190);
    expect(c.snapshot?.rows).toHaveLength(150);
    expect(a.snapshot?.rows[0].returns["1d"]).toBeCloseTo(10);
    expect(a.snapshot?.rows[0].price).toBe(110);
    expect(a.snapshot?.priceBasis).toBe("KRX_REGULAR_CLOSE");
    expect(c.snapshot?.rows[0].returns["1y"]).toBeNull();
    const calls = kospi.mock.calls.length;
    await loadSectors(d, now, kospi);
    expect(kospi).toHaveBeenCalledTimes(calls);
    expect(readSectors(d, "kosdaq150")?.universe).toBe("kosdaq150");
  });
  it("일부 실패·기준일 미반영 시 이전 성공 결과를 보존하고 실패만 1분 뒤 재시도한다", async () => {
    const d = db();
    const previous: SectorSnapshot = { version: sectorSnapshotVersion, priceBasis: "KRX_REGULAR_CLOSE", universe: "kospi200", asOf: "2026-10-30", fetchedAt: now.toISOString(), rows: [] };
    saveSectors(d, previous);
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(await loadSectors(d, now, offline)).toMatchObject({ stale: true, snapshot: previous });
    const calls = offline.mock.calls.length;
    await loadSectors(d, now, offline);
    expect(offline).toHaveBeenCalledTimes(calls);
    await loadSectors(d, new Date(now.getTime() + 60_001), offline);
    expect(offline.mock.calls.length).toBeGreaterThan(calls);
    expect(readSectors(d, "kospi200")).toEqual(previous);
    await expect(fetchSectorSnapshot("2026-11-02", "kospi200", upstream("kospi200", true), now)).rejects.toThrow("종가 미반영");
    const mismatch = upstream();
    const original = mismatch.getMockImplementation()!;
    mismatch.mockImplementation(async (url, init) => String(url).endsWith("/integration") ? Response.json({ itemCode: "wrong" }) : original(url, init));
    await expect(fetchSectorSnapshot("2026-11-02", "kospi200", mismatch, now)).rejects.toThrow("종목코드 불일치");
  });
  it("기존 통합 종가 스냅샷은 KRX 결과로 노출하지 않고 같은 날짜라도 재수집한다", async () => {
    const d = db();
    readSectors(d, "kospi200");
    d.prepare("INSERT INTO sector_return_snapshots(universe, as_of, payload) VALUES (?, ?, ?)").run("kospi200", "2026-11-02", JSON.stringify({ version: 3, universe: "kospi200", asOf: "2026-11-02", rows: [] }));
    expect(readSectors(d, "kospi200")).toBeNull();
    const result = await loadSectors(d, now, upstream());
    expect(result.stale).toBe(false);
    expect(result.snapshot).toMatchObject({ priceBasis: "KRX_REGULAR_CLOSE", version: sectorSnapshotVersion });
    expect(result.snapshot?.rows).toHaveLength(190);
  });
  it("선택 날짜별로 저장·재사용하고 실패해도 다른 날짜의 결과를 표시하지 않는다", async () => {
    const d = db(); const fetcher = upstream();
    const latest = await loadSectors(d, now, fetcher);
    const historical = await loadSectorsAtDate(d, "2026-10-30", "kospi200", fetcher, now);
    expect(historical.snapshot?.asOf).toBe("2026-10-30");
    expect(historical.snapshot?.rows[0].price).toBe(100);
    expect(historical.snapshot?.rows[0].returns["1d"]).toBeNull();
    expect(readSectors(d, "kospi200")?.asOf).toBe(latest.snapshot?.asOf);
    const calls = fetcher.mock.calls.length;
    await loadSectorsAtDate(d, "2026-10-30", "kospi200", fetcher, now);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(await loadSectorsAtDate(d, "2026-10-29", "kospi200", offline, now)).toMatchObject({ snapshot: null, stale: true, expectedDate: "2026-10-29" });
  });
});
