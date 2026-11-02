import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type AppDatabase } from "@/lib/db/client";
import { fearGreedDay, nextFearGreedRefresh, fearGreedRating, loadFearGreed, parseFearGreed } from "@/lib/sources/fear-greed";

const payload = {
  fear_and_greed: {
    score: 26.4, timestamp: "2026-10-31T00:00:00Z",
    previous_close: 34, previous_1_week: 16, previous_1_month: 30, previous_1_year: 37,
  },
  fear_and_greed_historical: { data: [
    { x: Date.parse("2026-10-30T00:00:00Z"), y: 25 },
    { x: Date.parse("2026-10-29T15:00:00Z"), y: 33 },
    { x: Date.parse("2026-10-29T00:00:00Z"), y: 32 },
    { x: Date.parse("2026-10-28T00:00:00Z"), y: null },
    { x: Date.parse("2026-10-27T00:00:00Z"), y: 101 },
    { x: "invalid", y: 20 },
  ] },
};

const databases: AppDatabase[] = [];
function database() {
  const db = openDatabase(":memory:");
  databases.push(db);
  return db;
}
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

describe("CNN 공포·탐욕 지수", () => {
  it("숫자 0을 유지하고 잘못된 수치를 결측으로 처리한다", () => {
    const result = parseFearGreed({ ...payload, fear_and_greed: { ...payload.fear_and_greed, score: 0, previous_close: 0, previous_1_week: null, previous_1_month: "30" } });
    expect(result.score).toBe(0);
    expect(result.previousClose).toBe(0);
    expect(result.previousWeek).toBeNull();
    expect(result.previousMonth).toBeNull();
  });

  it("날짜 정렬·중복 제거 후 최신 수치를 미국 거래일에 반영한다", () => {
    const result = parseFearGreed(payload);
    expect(result.points).toEqual([
      { date: "2026-10-29", value: 33 },
      { date: "2026-10-30", value: 26.4 },
    ]);
    expect(result.previousYear).toBe(37);
  });

  it.each([null, {}, { ...payload, fear_and_greed: { score: 101, timestamp: "bad" } }, { ...payload, fear_and_greed_historical: { data: [] } }])("잘못된 응답은 저장하기 전에 거부한다: %j", (input) => {
    expect(() => parseFearGreed(input)).toThrow();
  });

  it.each([[0, "극단적 공포"], [24.9, "극단적 공포"], [25, "공포"], [45, "중립"], [55, "중립"], [55.1, "탐욕"], [75, "탐욕"], [76, "극단적 탐욕"], [100, "극단적 탐욕"]])("%s점의 구간을 구분한다", (value, expected) => {
    expect(fearGreedRating(Number(value))).toBe(expected);
  });

  it("성공 응답을 저장하고 다음 오전 10시까지 재요청하지 않는다", async () => {
    const db = database();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload)));
    const first = await loadFearGreed(db, request, new Date("2026-10-31T01:00:00Z"));
    expect(first.stale).toBe(false);
    expect(first.snapshot?.score).toBe(26.4);
    const cached = await loadFearGreed(db, request, new Date("2026-11-01T00:59:59Z"));
    expect(cached).toEqual(first);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["http", "network", "malformed"])("%s 실패 시 마지막 스냅샷과 수집 시각을 유지한다", async (mode) => {
    const db = database();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const saved = await loadFearGreed(db, request, new Date("2026-10-31T01:00:00Z"));
    if (mode === "network") request.mockRejectedValueOnce(new Error("offline"));
    else request.mockResolvedValueOnce(mode === "http" ? new Response("blocked", { status: 418 }) : new Response("{}"));
    const fallback = await loadFearGreed(db, request, new Date("2026-11-01T01:00:00Z"));
    expect(fallback.stale).toBe(true);
    expect(fallback.snapshot).toEqual(saved.snapshot);
    expect(fallback.fetchedAt).toBe(saved.fetchedAt);
    expect(db.prepare("SELECT fetched_at FROM fear_greed_snapshot").get()?.fetched_at).toBe(saved.fetchedAt);
  });

  it("첫 연결 실패는 0점이나 가짜 이력으로 채우지 않는다", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("blocked", { status: 418 }));
    expect(await loadFearGreed(database(), request)).toMatchObject({ snapshot: null, fetchedAt: null, stale: true });
  });

  it.each(["2026-07-01", "2026-11-02"])("서머타임과 무관하게 %s 오전 10시 KST에 일별 키가 바뀐다", (date) => {
    const before = new Date(`${date}T00:59:59Z`);
    const at = new Date(`${date}T01:00:00Z`);
    expect(fearGreedDay(before)).not.toBe(fearGreedDay(at));
    expect(nextFearGreedRefresh(before)).toBe(at.getTime());
    expect(nextFearGreedRefresh(at)).toBe(at.getTime() + 86_400_000);
  });

  it("다음 일별 경계에서는 24시간이 안 지났어도 새 값을 받고 이후에는 재사용한다", async () => {
    const db = database();
    const newer = { ...payload, fear_and_greed: { ...payload.fear_and_greed, score: 40, timestamp: "2026-11-01T00:00:00Z" } };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      .mockResolvedValueOnce(new Response(JSON.stringify(newer)));
    await loadFearGreed(db, request, new Date("2026-10-31T22:00:00Z"));
    const updated = await loadFearGreed(db, request, new Date("2026-11-01T01:00:00Z"));
    expect(updated.snapshot?.score).toBe(40);
    expect(await loadFearGreed(db, request, new Date("2026-11-01T18:00:00Z"))).toEqual(updated);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("CNN이 같은 기준 시각을 반환하면 이력에 가짜 날짜를 추가하지 않는다", async () => {
    const db = database();
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(payload)));
    const first = await loadFearGreed(db, request, new Date("2026-10-31T01:00:00Z"));
    const next = await loadFearGreed(db, request, new Date("2026-11-01T01:00:00Z"));
    expect(next.snapshot).toEqual(first.snapshot);
    expect(next.fetchedAt).not.toBe(first.fetchedAt);
  });

  it("이전 기준 시각의 응답으로 최신 수치를 덮어쓰지 않는다", async () => {
    const db = database();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const first = await loadFearGreed(db, request, new Date("2026-10-31T01:00:00Z"));
    request.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, fear_and_greed: { ...payload.fear_and_greed, timestamp: "2026-10-29T00:00:00Z" } })));
    const next = await loadFearGreed(db, request, new Date("2026-11-01T01:00:00Z"));
    expect(next.stale).toBe(true);
    expect(next.snapshot).toEqual(first.snapshot);
    expect(next.fetchedAt).toBe(first.fetchedAt);
  });
});
