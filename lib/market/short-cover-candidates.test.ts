import { describe, expect, it } from "vitest";
import { rankShortCoverCandidates, type ShortCoverStock } from "./short-cover-candidates";

const sessions = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, session_status: "trading" }));
const stock = (code: string, balance: number | null, flow: number | null, asOf = "2026-11-06"): ShortCoverStock => ({
  code, name: code, short_value_ratio_pct_mean_20: flow, cover_price_rise_pct: 2,
  latest_disclosed_balance: { as_of: asOf, balance_ratio_pct: balance },
});

describe("short-cover review candidates", () => {
  it("ranks the latest disclosed short balance and prior 20-session flow, giving ties equal scores", () => {
    const ranked = rankShortCoverCandidates([stock("a", 5, 4), stock("b", 2, 1), stock("c", 5, 4)], sessions, "2026-11-08");
    expect(ranked.map(x => x.stock.code)).toEqual(["a", "c", "b"]);
    expect(ranked[0].score).toBe(ranked[1].score);
    expect(ranked[0].balanceAge).toBe(2);
    expect(ranked[0].score).toBeGreaterThan(ranked[2].score);
  });

  it("excludes missing, zero, non-finite, stale, and unrecognized balance dates", () => {
    const rows = [stock("good", 1, 0, "2026-11-03"), stock("stale", 1, 5, "2026-11-02"),
      stock("missing", null, 2), stock("zero", 0, 2), stock("nan", 1, NaN),
      stock("unknown", 1, 2, "2026-10-31"), stock("future", 1, 2, "2026-11-09")];
    expect(rankShortCoverCandidates(rows, sessions, "2026-11-08").map(x => x.stock.code)).toEqual(["good"]);
    expect(rankShortCoverCandidates(rows, sessions, "2026-11-09")).toEqual([]);
  });
});
