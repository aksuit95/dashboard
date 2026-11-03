import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sources/proxy-daily-close", () => ({ loadProxyDailyClose: vi.fn() }));
import { loadProxyDailyClose } from "@/lib/sources/proxy-daily-close";
import { GET } from "@/app/api/cron/proxy-close/[market]/route";
import vercel from "../../vercel.json";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

const invoke = (market: string, authorization?: string) => GET(
  new Request(`https://example.com/api/cron/proxy-close/${market}`, {
    headers: authorization ? { authorization } : {},
  }), { params: Promise.resolve({ market }) },
);

describe("Vercel daily close cron", () => {
  it("registers the four requested Korean-time schedules in UTC", () => {
    expect(vercel.crons).toEqual(expect.arrayContaining([
      { path: "/api/cron/proxy-close/us", schedule: "0 22 * * *" },
      { path: "/api/cron/proxy-close/kr", schedule: "0 7 * * *" },
      { path: "/api/cron/minervini", schedule: "0 7 * * *" },
      { path: "/api/cron/fear-greed", schedule: "0 1 * * *" },
    ]));
  });
  it("rejects missing secrets and invalid credentials without fetching prices", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await invoke("us")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    expect((await invoke("kr", "Bearer incorrect")).status).toBe(401);
    expect(loadProxyDailyClose).not.toHaveBeenCalled();
  });
  it.each(["kr", "us"])("warms the chart cache for the %s job", async market => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.mocked(loadProxyDailyClose).mockResolvedValue({
      closeDate: "2026-11-02", samsung: [],
      adr: [{ date: "2026-11-02", value: 12, premium: 12, commonKrw: 100000,
        adrPerShareKrw: 112000, adrDate: "2026-11-02", fxDate: "2026-11-02" }],
    });
    const response = await invoke(market, "Bearer test-cron-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, market, adrCloseDate: "2026-11-02" });
    expect(loadProxyDailyClose).toHaveBeenCalledOnce();
  });
  it("reports upstream failures and rejects unknown markets", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    expect((await invoke("other", "Bearer test-cron-secret")).status).toBe(400);
    expect(loadProxyDailyClose).not.toHaveBeenCalled();
    vi.mocked(loadProxyDailyClose).mockRejectedValue(new Error("unavailable"));
    expect((await invoke("us", "Bearer test-cron-secret")).status).toBe(503);
  });
});
