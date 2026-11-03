import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cache: new Map<string, unknown>(), load: vi.fn(), save: vi.fn(), saved: null as unknown }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...args: string[]) => Promise<unknown>) => async (...args: string[]) => {
  const key = JSON.stringify(args);
  if (state.cache.has(key)) return state.cache.get(key);
  const value = await fn(...args);
  state.cache.set(key, value);
  return value;
} }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/sources/minervini-daily", () => ({ loadMinervini: state.load, readMinervini: () => state.saved, saveMinervini: state.save }));
const snapshot = { version: 4, priceBasis: "KRX_REGULAR_CLOSE", asOf: "2026-11-02", fetchedAt: "2026-11-02T08:00:00Z", universeSize: 201, rows: [] };
const success = { snapshot, expectedDate: "2026-11-02", stale: false, error: null };
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T08:00:00Z"));
  state.cache.clear(); state.load.mockReset().mockResolvedValue(success); state.save.mockReset(); state.saved = null;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("미너비니 공통 일별 캐시와 예약 수집", () => {
  it("동시 요청과 새 인스턴스가 같은 거래일의 성공 결과를 공유한다", async () => {
    const first = await import("./minervini-cache");
    await Promise.all([first.loadDailyMinervini(), first.loadDailyMinervini()]);
    vi.resetModules();
    const second = await import("./minervini-cache");
    expect(await second.loadDailyMinervini()).toEqual(success);
    expect(state.load).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledWith({}, snapshot, "kospi200");
  });
  it("다음 거래일 16:00 이전에는 이전 결과, 이후에는 새 결과를 수집한다", async () => {
    const { loadDailyMinervini } = await import("./minervini-cache");
    await loadDailyMinervini();
    vi.setSystemTime(new Date("2026-11-03T06:59:59Z"));
    await loadDailyMinervini();
    expect(state.load).toHaveBeenCalledTimes(1);
    state.load.mockResolvedValue({ ...success, snapshot: { ...snapshot, asOf: "2026-11-03" }, expectedDate: "2026-11-03" });
    vi.setSystemTime(new Date("2026-11-03T07:00:00Z"));
    expect((await loadDailyMinervini()).snapshot?.asOf).toBe("2026-11-03");
    expect(state.load).toHaveBeenCalledTimes(2);
  });
  it("실패를 하루 종일 캐시하지 않고 이전 결과를 보존하며 1분 후 재시도한다", async () => {
    state.saved = { ...snapshot, asOf: "2026-10-30" };
    state.load.mockResolvedValueOnce({ snapshot: state.saved, stale: true, error: "종가 미반영" });
    const { loadDailyMinervini } = await import("./minervini-cache");
    const failed = await loadDailyMinervini();
    expect(failed).toMatchObject({ stale: true, snapshot: state.saved, error: "종가 미반영" });
    await loadDailyMinervini();
    expect(state.load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    expect(await loadDailyMinervini()).toEqual(success);
    expect(state.load).toHaveBeenCalledTimes(2);
  });
  it("예약 경로는 인증이 없으면 수집하지 않고, 인증된 호출은 화면과 캐시를 공유한다", async () => {
    const { GET } = await import("@/app/api/cron/minervini/route");
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("http://localhost/api/cron/minervini"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "test-only");
    expect((await GET(new Request("http://localhost/api/cron/minervini", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect(state.load).not.toHaveBeenCalled();
    expect((await GET(new Request("http://localhost/api/cron/minervini", { headers: { authorization: "Bearer test-only" } }))).status).toBe(200);
    const { loadDailyMinervini } = await import("./minervini-cache");
    await loadDailyMinervini();
    expect(state.load).toHaveBeenCalledTimes(2);
  });
  it("예약 수집 실패를 503으로 반환한다", async () => {
    vi.stubEnv("CRON_SECRET", "test-only");
    state.load.mockResolvedValue({ snapshot: null, stale: true, error: "offline" });
    const { GET } = await import("@/app/api/cron/minervini/route");
    const response = await GET(new Request("http://localhost/api/cron/minervini", { headers: { authorization: "Bearer test-only" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "offline" });
  });
  it("동시 요청·재시작에서도 시장별 캐시를 유지하고 한 시장의 실패가 다른 시장을 막지 않는다", async () => {
    state.load.mockImplementation(async (_db, _now, _fetch, universe) => ({ ...success, snapshot: { ...snapshot, universe, universeSize: universe === "kosdaq150" ? 150 : 201 } }));
    const { loadDailyMinervini } = await import("./minervini-cache");
    const [kospi, kosdaq] = await Promise.all([loadDailyMinervini("kospi200"), loadDailyMinervini("kosdaq150")]);
    expect(kospi.snapshot?.universeSize).toBe(201);
    expect(kosdaq.snapshot?.universeSize).toBe(150);
    expect(state.load).toHaveBeenCalledTimes(2);
    vi.resetModules();
    const next = await import("./minervini-cache");
    expect((await next.loadDailyMinervini("kosdaq150")).snapshot?.universeSize).toBe(150);
    expect(state.load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-11-03T08:00:00Z"));
    state.load.mockImplementation(async (_db, _now, _fetch, universe) => universe === "kosdaq150" ? { stale: true, snapshot: null, error: "kosdaq offline" } : { ...success, snapshot: { ...snapshot, asOf: "2026-11-03", universe } });
    expect((await next.loadDailyMinervini("kosdaq150")).stale).toBe(true);
    expect((await next.loadDailyMinervini("kospi200")).stale).toBe(false);
  });
  it("화면 API는 시장 인자를 검증하고 해당 시장의 결과만 요청한다", async () => {
    const { GET } = await import("@/app/api/minervini/route");
    expect((await GET(new Request("http://localhost/api/minervini?universe=invalid"))).status).toBe(400);
    expect(state.load).not.toHaveBeenCalled();
    expect((await GET(new Request("http://localhost/api/minervini?universe=kosdaq150"))).status).toBe(200);
    expect(state.load.mock.calls[0][3]).toBe("kosdaq150");
    expect((await GET(new Request("http://localhost/api/minervini"))).status).toBe(200);
    expect(state.load.mock.calls[1][3]).toBe("kospi200");
  });
  it("예약 경로는 한 시장 실패 시에도 다른 시장을 갱신하고 각각의 결과를 반환한다", async () => {
    vi.stubEnv("CRON_SECRET", "test-only");
    state.load.mockImplementation(async (_db, _now, _fetch, universe) => universe === "kosdaq150" ? { stale: true, snapshot: null, error: "kosdaq offline" } : success);
    const { GET } = await import("@/app/api/cron/minervini/route");
    const response = await GET(new Request("http://localhost/api/cron/minervini", { headers: { authorization: "Bearer test-only" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ results: [{ universe: "kospi200", ok: true }, { universe: "kosdaq150", ok: false }] });
    expect(state.load).toHaveBeenCalledTimes(2);
  });
});
