import { expect, it } from "vitest";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";

it("uses the 16:30 special-session close until the next completed session", () => {
  expect(reviewedCloseSession(new Date("2026-11-19T16:29:59+09:00"))).toBe("2026-11-18");
  expect(reviewedCloseSession(new Date("2026-11-19T16:30:00+09:00"))).toBe("2026-11-19");
  expect(reviewedCloseSession(new Date("2026-11-20T15:59:00+09:00"))).toBe("2026-11-19");
  expect(reviewedCloseSession(new Date("2026-11-20T16:00:00+09:00"))).toBe("2026-11-20");
});
