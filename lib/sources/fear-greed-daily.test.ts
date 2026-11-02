import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  load: vi.fn(),
  fallback: { snapshot: null, fetchedAt: null, stale: false },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: string[]) => Promise<unknown>) => async (...args: string[]) => {
    const key = JSON.stringify(args);
    if (state.cache.has(key)) return state.cache.get(key);
    const value = await fn(...args);
    state.cache.set(key, value);
    return value;
  },
}));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/sources/fear-greed", async (original) => ({
  ...await original<typeof import("@/lib/sources/fear-greed")>(),
  loadFearGreed: state.load,
  readFearGreed: () => state.fallback,
}));

const success = { snapshot: { score: 26, asOf: "2026-11-01T23:59:00Z" }, fetchedAt: "2026-11-02T01:00:00Z", stale: false };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T01:00:00Z"));
  state.cache.clear();
  state.load.mockReset().mockResolvedValue(success);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("CNN 일별 공통 캐시와 Vercel 예약 경로", () => {
  it("새 서버 인스턴스에서도 같은 날의 캐시를 공유한다", async () => {
    const first = await import("./fear-greed-daily");
    await first.loadDailyFearGreed();
    vi.resetModules();
    const second = await import("./fear-greed-daily");
    expect(await second.loadDailyFearGreed()).toEqual(success);
    expect(state.load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-03T01:00:00Z"));
    await second.loadDailyFearGreed();
    expect(state.load).toHaveBeenCalledTimes(2);
  });

  it("방문자 동시 요청은 한 번의 수집을 공유한다", async () => {
    const { loadDailyFearGreed } = await import("./fear-greed-daily");
    await Promise.all([loadDailyFearGreed(), loadDailyFearGreed(), loadDailyFearGreed()]);
    expect(state.load).toHaveBeenCalledTimes(1);
  });

  it("수집 실패를 일별 성공으로 캐시하지 않고 1분 후 재시도한다", async () => {
    state.load.mockResolvedValueOnce({ ...state.fallback, stale: true });
    const { loadDailyFearGreed } = await import("./fear-greed-daily");
    expect((await loadDailyFearGreed()).stale).toBe(true);
    await loadDailyFearGreed();
    expect(state.load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    expect(await loadDailyFearGreed()).toEqual(success);
    expect(state.load).toHaveBeenCalledTimes(2);
  });

  it("예약 수집 비밀값이 없거나 틀리면 CNN을 호출하지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("@/app/api/cron/fear-greed/route");
    expect((await GET(new Request("http://localhost/api/cron/fear-greed"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "test-secret");
    expect((await GET(new Request("http://localhost/api/cron/fear-greed", { headers: { authorization: "Bearer incorrect" } }))).status).toBe(401);
    expect(state.load).not.toHaveBeenCalled();
  });

  it("인증된 예약 수집은 방문자와 같은 캐시를 채운다", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const { GET } = await import("@/app/api/cron/fear-greed/route");
    const response = await GET(new Request("http://localhost/api/cron/fear-greed", { headers: { authorization: "Bearer test-secret" } }));
    expect(response.status).toBe(200);
    const { loadDailyFearGreed } = await import("./fear-greed-daily");
    await loadDailyFearGreed();
    expect(state.load).toHaveBeenCalledTimes(1);
  });
});
