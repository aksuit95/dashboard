import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/sources/yahoo", () => ({ fetchYahooHistory: vi.fn() }));

import { fetchYahooHistory } from "@/lib/sources/yahoo";
import { loadProxyDailyClose } from "@/lib/sources/proxy-daily-close";

describe("한미 종가 갱신", () => {
  it("미국 본장 마감 후에도 오전 7시까지 유지하고 7시에 새 ADR을 반영한다", async () => {
    const histories: Record<string, { date: string; close: number }[]> = {
      "005930.KS": [{ date: "2026-11-02", close: 100 }],
      "005935.KS": [{ date: "2026-11-02", close: 80 }],
      "000660.KS": [{ date: "2026-11-02", close: 100000 }, { date: "2026-11-03", close: 999999 }],
      SKHY: [{ date: "2026-10-30", close: 8 }, { date: "2026-11-02", close: 9 }, { date: "2026-11-03", close: 99 }],
      "KRW=X": [{ date: "2026-10-30", close: 1400 }, { date: "2026-11-02", close: 1410 }, { date: "2026-11-03", close: 9999 }],
    };
    vi.mocked(fetchYahooHistory).mockImplementation(async symbol => ({ status: "ok", data: histories[symbol] }));
    const before = await loadProxyDailyClose(new Date("2026-11-03T06:59:59+09:00"));
    const after = await loadProxyDailyClose(new Date("2026-11-03T07:00:00+09:00"));
    expect(before.adr.at(-1)).toMatchObject({ date: "2026-11-02", adrDate: "2026-10-30", adrPerShareKrw: 112000 });
    expect(after.adr.at(-1)).toMatchObject({ date: "2026-11-02", adrDate: "2026-11-02", fxDate: "2026-11-02", adrPerShareKrw: 126900 });
    expect(after.samsung).toEqual(before.samsung);
  });
});
