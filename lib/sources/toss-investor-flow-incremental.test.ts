import { describe, expect, it, vi, afterEach } from "vitest";
import { loadTossMarketFlow, type TossMarketFlow } from "./toss-investor-flow";

const point = (date: string) => ({ date, individual: 1, foreign: 2, institution: 3 });
const row = (date: string) => ({ date, updatedAt: `${date}T18:00:00+09:00`, individual: { buyAmount: "2", sellAmount: "1" }, foreigner: { buyAmount: "3", sellAmount: "1" }, institution: { buyAmount: "4", sellAmount: "1" } });
const prior: TossMarketFlow = { market: "KOSPI", asOf: "2026-11-02", collectedAt: "2026-11-02T10:00:00Z", latestUpdatedAt: null, points: [point("2025-11-03"), point("2026-11-02")] };
function fakeFetch(records: ReturnType<typeof row>[]) {
  return vi.fn(async (input: string | URL | Request) => String(input).includes("oauth2/token")
    ? Response.json({ access_token: "test", expires_in: 3600 })
    : Response.json({ result: { records, nextUntil: null } })) as unknown as typeof fetch;
}
afterEach(() => vi.unstubAllEnvs());
describe("market flow incremental collection", () => {
  it("requests just the new day and merges it with stored history", async () => {
    vi.stubEnv("TOSS_CLIENT_ID", "test"); vi.stubEnv("TOSS_CLIENT_SECRET", "test");
    const fetcher = fakeFetch([row("2026-11-03")]);
    const result = await loadTossMarketFlow("kospi200", "2026-11-03", fetcher, prior);
    const urls = vi.mocked(fetcher).mock.calls.map(call => String(call[0]));
    expect(urls.find(url => url.includes("investor-trading"))).toContain("count=1&until=2026-11-03");
    expect(result.points).toEqual([...prior.points, point("2026-11-03")]);
  });
  it("requests the missed calendar interval and merges all returned sessions", async () => {
    const fetcher = fakeFetch([row("2026-11-05"), row("2026-11-04"), row("2026-11-03")]);
    const result = await loadTossMarketFlow("kospi200", "2026-11-05", fetcher, prior);
    expect(vi.mocked(fetcher).mock.calls.some(call => String(call[0]).includes("count=3&until=2026-11-05"))).toBe(true);
    expect(result.points.map(p => p.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  });
  it("starts a full history fetch when stored history is insufficient", async () => {
    const fetcher = fakeFetch([row("2026-11-03")]);
    await loadTossMarketFlow("kospi200", "2026-11-03", fetcher, { ...prior, points: [point("2026-11-02")] });
    expect(vi.mocked(fetcher).mock.calls.some(call => String(call[0]).includes("count=100&until=2026-11-03"))).toBe(true);
  });
});
