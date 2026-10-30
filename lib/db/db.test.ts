import { describe, expect, it } from "vitest";
import { activeInstruments } from "@/config/universe";
import { databasePath, openDatabase } from "@/lib/db/client";
import { applyQuote, readQuote, recordIngest, syncInstruments } from "@/lib/db/quotes";
import { ok, stale, empty } from "@/lib/sources/types";

const payload = {
  price: 100,
  previousClose: 90,
  asOf: "2026-10-29T00:00:00.000Z",
  session: "live" as const,
  fundingHourly: 0.001,
  sharesOutstanding: 10,
  marketCap: 1000,
  marketCapCurrency: "USD",
  nav: 99,
};

describe("시세 저장", () => {
  it("성공한 스냅샷만 가격을 바꾸고 실패는 이전 값을 남긴다", () => {
    const db = openDatabase(":memory:");
    syncInstruments(db, activeInstruments());
    const id = "EWY";
    applyQuote(db, id, ok(payload), "2026-10-29T01:00:00.000Z");
    applyQuote(db, id, stale("timeout"), "2026-10-29T01:01:00.000Z");
    const afterStale = readQuote(db, id);
    expect(afterStale?.price).toBe(100);
    expect(afterStale?.stale).toBe(true);

    applyQuote(db, id, empty("빈 응답"), "2026-10-29T01:02:00.000Z");
    const afterEmpty = readQuote(db, id);
    expect(afterEmpty?.price).toBe(100);
    expect(afterEmpty?.stale).toBe(true);

    applyQuote(db, id, ok({ ...payload, price: 120 }), "2026-10-29T01:03:00.000Z");
    const afterOk = readQuote(db, id);
    expect(afterOk?.price).toBe(120);
    expect(afterOk?.stale).toBe(false);

    recordIngest(db, {
      source: "yahoo",
      startedAt: "2026-10-29T01:00:00.000Z",
      finishedAt: "2026-10-29T01:00:01.000Z",
      status: "stale",
      message: "timeout",
    });
    const runs = db.prepare("SELECT status, message FROM ingest_runs").all() as { status: string; message: string }[];
    expect(runs).toEqual([{ status: "stale", message: "timeout" }]);
    db.close();
  });

  it("Vercel 에서는 읽기 전용 프로젝트 경로 대신 임시 파일을 쓴다", () => {
    const previousVercel = process.env.VERCEL;
    const previousUrl = process.env.DATABASE_URL;
    process.env.VERCEL = "1";
    process.env.DATABASE_URL = "file:./data/market.sqlite";
    expect(databasePath()).toBe("/tmp/market.sqlite");
    if (previousVercel == null) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousUrl == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  it("저장된 적 없는 종목의 실패는 0원 행을 만들지 않는다", () => {
    const db = openDatabase(":memory:");
    syncInstruments(db, activeInstruments());
    applyQuote(db, "DRAM", stale("down"), "2026-10-29T01:00:00.000Z");
    expect(readQuote(db, "DRAM")).toBeNull();
    db.close();
  });
});
