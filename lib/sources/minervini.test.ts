import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "@/lib/db/client";
import { fetchMinerviniSnapshot, parseKospi200, parseMinerviniMembers, parseMinerviniBars, type MinerviniSnapshot } from "./minervini";
import type { MinerviniUniverse } from "@/config/minervini";
import { loadMinervini, readMinervini, saveMinervini } from "./minervini-daily";

const stock = { itemCode: "005930", name: "삼성전자", marketType: "KOSPI", stockEndType: "stock", marketValue: 1e12, tradableStatus: "tradable" };
const xml = '<chartdata><item data="20261030|100|110|90|105|1000" /><item data="20261102|105|115|100|110|2000" /></chartdata>';
const now = new Date("2026-11-02T08:00:00Z");
const dbs: AppDatabase[] = [];
const db = () => { const d = openDatabase(":memory:"); dbs.push(d); return d; };
afterEach(() => { dbs.splice(0).forEach(d => d.close()); vi.restoreAllMocks(); });

function upstream(universe: MinerviniUniverse = "kospi200") {
  return vi.fn<typeof fetch>().mockImplementation(async url => {
    const u = new URL(String(url));
    if (u.pathname.includes("enrollStock")) {
      const page = Number(u.searchParams.get("page"));
      const lastPage = universe === "kospi200" ? 4 : 3;
      const count = universe === "kospi200" && page === 4 ? 40 : 50;
      return Response.json({ isSuccess: true, result: { hasNext: page < lastPage, stocks: Array.from({ length: count }, (_, i) => ({ ...stock, marketType: universe === "kospi200" ? "KOSPI" : "KOSDAQ", itemCode: String(((page - 1) * 50 + i + 1) * 10).padStart(6, "0") })) } });
    }
    return new Response(xml);
  });
}
describe("코스피200 수집·일별 저장", () => {
  it("검증된 구성 필드를 사용하고 잘린 응답을 거절한다", () => {
    expect(parseKospi200({ isSuccess: true, result: { stocks: [stock], hasNext: false } }).stocks[0].marketCap).toBe(1e12);
    expect(parseKospi200({ isSuccess: true, result: { stocks: [{ ...stock, itemCode: "0126Z0" }], hasNext: false } }).stocks[0].code).toBe("0126Z0");
    expect(() => parseKospi200({ result: { stocks: [stock] } })).toThrow();
    expect(() => parseKospi200({ isSuccess: true, result: { stocks: [{ ...stock, marketValue: null }], hasNext: false } })).toThrow();
  });
  it("진행 중 일봉을 제외하고 정지 일봉·결측을 구분한다", () => {
    expect(parseMinerviniBars(xml, "2026-10-30")).toHaveLength(1);
    expect(parseMinerviniBars('<item data="20261030|0|0|0|105|0" />', "2026-10-30")[0]).toMatchObject({ high: 105, volume: 0 });
    expect(() => parseMinerviniBars('<item data="20261030|100|90|110|105|10" />', "2026-10-30")).toThrow();
    expect(() => parseMinerviniBars('<item data="20261030|100|110|90||10" />', "2026-10-30")).toThrow();
  });
  it("페이지 전체 수집 후 동일 기준일로 분석하고 동시·반복 호출은 재수집하지 않는다", async () => {
    const d = db(); const fetcher = upstream();
    const [one, two] = await Promise.all([loadMinervini(d, now, fetcher), loadMinervini(d, now, fetcher)]);
    expect(one).toEqual(two);
    expect(one.stale).toBe(false);
    expect(one.snapshot?.universeSize).toBe(190);
    expect(one.snapshot?.rows).toHaveLength(190);
    expect(one.snapshot?.rankedSize).toBe(0);
    const calls = fetcher.mock.calls.length;
    await loadMinervini(d, now, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(readMinervini(d)?.asOf).toBe("2026-11-02");
  });
  it("일부 실패·종가 미반영 시 마지막 성공값을 유지하고 1분 후 재시도한다", async () => {
    const d = db();
    const previous: MinerviniSnapshot = { asOf: "2026-10-30", fetchedAt: "2026-10-30T08:00:00Z", membershipAt: "2026-10-30T08:00:00Z", universeSize: 200, rankedSize: 0, rows: [] };
    saveMinervini(d, previous);
    const fail = vi.fn<typeof fetch>().mockRejectedValue(new Error("upstream offline"));
    const result = await loadMinervini(d, now, fail);
    expect(result).toMatchObject({ stale: true, snapshot: previous });
    expect(readMinervini(d)).toEqual(previous);
    await loadMinervini(d, now, fail);
    expect(fail).toHaveBeenCalledTimes(1);
    await loadMinervini(d, new Date(now.getTime() + 60_001), fail);
    expect(fail).toHaveBeenCalledTimes(2);
    const old = upstream();
    old.mockImplementation(async url => String(url).includes("enrollStock") ? upstream()(url) : new Response(xml.replaceAll("20261102", "20261029")));
    await expect(fetchMinerviniSnapshot("2026-11-02", old, now)).rejects.toThrow("종가 미반영");
  });
  it("상위 50개만 반환하는 불완전 유니버스로 RS를 생성하지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ isSuccess: true, result: { hasNext: false, stocks: [stock] } }));
    await expect(fetchMinerviniSnapshot("2026-11-02", fetcher, now)).rejects.toThrow("전체 구성 확인 실패");
  });
  it("코스닥150은 KQI150 구성 전체를 조회하고 다른 시장의 행을 거절한다", async () => {
    const fetcher = upstream("kosdaq150");
    const result = await fetchMinerviniSnapshot("2026-11-02", fetcher, now, "kosdaq150");
    expect(result).toMatchObject({ universe: "kosdaq150", universeSize: 150 });
    expect(result.rows).toHaveLength(150);
    const memberCalls = fetcher.mock.calls.filter(([url]) => String(url).includes("enrollStock"));
    expect(memberCalls).toHaveLength(3);
    expect(memberCalls.every(([url]) => new URL(String(url)).searchParams.get("code") === "KQI150")).toBe(true);
    expect(() => parseMinerviniMembers({ isSuccess: true, result: { stocks: [stock], hasNext: false } }, "kosdaq150")).toThrow("코스닥150 구성종목 필드 오류");
  });
  it("같은 DB·같은 날짜의 동시 수집, 저장값과 실패 재시도를 시장별로 분리한다", async () => {
    const d = db(); const kospiFetch = upstream(); const kosdaqFetch = upstream("kosdaq150");
    const [kospi, kosdaq] = await Promise.all([
      loadMinervini(d, now, kospiFetch, "kospi200"),
      loadMinervini(d, now, kosdaqFetch, "kosdaq150"),
    ]);
    expect(kospi.snapshot?.universeSize).toBe(190);
    expect(kosdaq.snapshot?.universeSize).toBe(150);
    expect(readMinervini(d)?.universe).toBe("kospi200");
    expect(readMinervini(d, "kosdaq150")?.universe).toBe("kosdaq150");
    expect(() => saveMinervini(d, kosdaq.snapshot!, "kospi200")).toThrow("유니버스 불일치");
    const calls = kosdaqFetch.mock.calls.length;
    await loadMinervini(d, now, kosdaqFetch, "kosdaq150");
    expect(kosdaqFetch).toHaveBeenCalledTimes(calls);
    const nextDay = new Date("2026-11-03T08:00:00Z");
    const fail = vi.fn<typeof fetch>().mockRejectedValue(new Error("kosdaq offline"));
    expect((await loadMinervini(d, nextDay, fail, "kosdaq150")).snapshot).toEqual(kosdaq.snapshot);
    expect(readMinervini(d)).toEqual(kospi.snapshot);
    const otherFail = vi.fn<typeof fetch>().mockRejectedValue(new Error("kospi offline"));
    await loadMinervini(d, nextDay, otherFail, "kospi200");
    expect(otherFail).toHaveBeenCalledTimes(1);
  });
});
