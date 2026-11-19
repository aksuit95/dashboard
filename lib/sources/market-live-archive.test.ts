import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readMarketLiveArchive, readMarketLiveRotationFrame, recordMarketLiveArchive } from "@/lib/sources/market-live-archive";
import type { MarketLiveBoardData, MarketLiveRotationStock } from "@/lib/market/market-live";

const date = "2026-11-18";
const baselineDate = "2026-11-17";
const at = (time: string) => Date.parse(`${date}T${time}+09:00`);

function stock(code: string, time: string, price: number): MarketLiveRotationStock {
  return { code, market: "KOSPI", sector: "반도체", price, close: 100, asOf: `${date}T${time}+09:00` };
}

function board(time: string, rotationStocks: MarketLiveRotationStock[], state: MarketLiveBoardData["state"] = "open"): MarketLiveBoardData {
  return {
    state, note: null, date, baselineDate, collectedAt: new Date(at(time)).toISOString(), indexes: [], leaders: [],
    sectors: [{ name: "반도체", changePct: 99, up: 3, compared: 3, total: 3, asOf: new Date(at(time)).toISOString() }],
    rotationStocks, breadth: { up: 0, flat: 0, down: 0, compared: 3, total: 3 }, warnings: [],
  };
}

describe("KRX 섹터 장중 기록 저장소", () => {
  let directory: string;
  let file: string;
  beforeEach(async () => {
    const tmp = path.resolve("tmp");
    await mkdir(tmp, { recursive: true });
    directory = await mkdtemp(path.join(tmp, "market-live-archive-test-"));
    file = path.join(directory, "archive.sqlite");
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("기존 15:30 기록을 유지하면서 다음 거래일의 16:30 비교 기준을 저장한다", async () => {
    const collect = async () => board("10:00:09", [stock("005930", "10:00:04", 103)]);
    await recordMarketLiveArchive({ now: at("10:00:08"), file, collect });
    const table = "market_live_archive_v1";
    const db = new DatabaseSync(file);
    try {
      const schema = String(db.prepare("SELECT sql FROM sqlite_schema WHERE name = ?").get(table)?.sql);
      const legacy = schema.replace(/price_basis = CASE[\s\S]+? END/, "price_basis = 'KRX_REGULAR_CLOSE_1530_KST'");
      expect(legacy).not.toBe(schema);
      db.exec(`ALTER TABLE ${table} RENAME TO fixture; ${legacy};
        INSERT INTO ${table} SELECT * FROM fixture; DROP TABLE fixture;`);
    } finally { db.close(); }

    const next = "2026-11-20";
    const base = "2026-11-19";
    const nextBoard: MarketLiveBoardData = {
      ...await collect(), date: next, baselineDate: base, collectedAt: `${next}T10:00:09+09:00`,
      rotationStocks: [{ ...stock("005930", "10:00:04", 103), close: 100, asOf: `${next}T10:00:04+09:00` }],
    };
    expect(await recordMarketLiveArchive({ now: Date.parse(nextBoard.collectedAt), file, collect: async () => nextBoard }))
      .toMatchObject({ status: "recorded", stocks: 1 });
    expect(readMarketLiveArchive(undefined, file)).toMatchObject({ dates: [next, date], day: { baselineDate: base } });
    const reader = new DatabaseSync(file, { readOnly: true });
    try {
      expect(reader.prepare(`SELECT price_basis FROM ${table} ORDER BY trade_date`).all().map(row => row.price_basis))
        .toEqual(["KRX_REGULAR_CLOSE_1530_KST", "KRX_REGULAR_CLOSE_1630_KST"]);
    } finally { reader.close(); }
  });

  it("같은 분의 재시도는 덧붙이지 않고 유효한 원본 시세와 수집 시간을 함께 보존한다", async () => {
    expect(readMarketLiveArchive(undefined, file)).toEqual({ dates: [], day: null });
    const valid = stock("005930", "10:00:04", 103);
    const collect = async () => board("10:00:09", [valid, stock("000660", "09:58:00", 300), stock("010120", "10:00:20", 300)]);
    expect(await recordMarketLiveArchive({ now: at("10:00:08"), file, collect })).toMatchObject({ status: "recorded", stocks: 1 });
    expect(await recordMarketLiveArchive({
      now: at("10:00:37"), file, collect: async () => board("10:00:42", [stock("005930", "10:00:41", 200)]),
    })).toMatchObject({ status: "exists" });
    expect(await recordMarketLiveArchive({
      now: at("10:01:08"), file, collect: async () => board("10:01:09", [stock("005930", "10:01:05", 105)]),
    })).toMatchObject({ status: "recorded" });

    const { dates, day } = readMarketLiveArchive(undefined, file);
    expect(dates).toEqual([date]);
    expect(day?.baselineDate).toBe(baselineDate);
    expect(day?.frames.map(frame => frame.collectedAt)).toEqual(["2026-11-18T01:00:09.000Z", "2026-11-18T01:01:09.000Z"]);
    expect(day?.frames[0]).not.toHaveProperty("stocks");
    expect(day?.frames[0].sectors[0]).toMatchObject({ compared: 1, up: 1, total: 3, asOf: "2026-11-18T01:00:04.000Z" });
    expect(day?.frames[0].sectors[0].changePct).toBeCloseTo(3);
    expect(readMarketLiveArchive("2026-11-17", file)).toEqual({ dates: [date], day: null });
    expect(readMarketLiveRotationFrame(date, baselineDate, at("10:00:09"), at("10:01:08"), file)?.stocks).toEqual([valid]);
    expect(readMarketLiveRotationFrame(date, baselineDate, at("10:00:09"), at("10:01:09"), file)?.stocks[0].price).toBe(105);
    expect(readMarketLiveRotationFrame(date, "2026-11-16", at("10:00:09"), at("10:01:09"), file)).toBeNull();
  });

  it("정규장 밖에서는 시세를 조회하지 않고 종가 동시호가에는 이전 접속매매 체결을 기록하지 않는다", async () => {
    const collect = vi.fn(async () => board("15:20:09", [stock("005930", "15:19:59", 101)], "auction"));
    expect(await recordMarketLiveArchive({ now: at("08:58:00"), file, collect })).toEqual({ status: "skipped" });
    expect(await recordMarketLiveArchive({ now: at("15:30:00"), file, collect })).toEqual({ status: "skipped" });
    expect(collect).not.toHaveBeenCalled();
    expect(await recordMarketLiveArchive({ now: at("15:20:08"), file, collect })).toMatchObject({ status: "missing" });
    expect(readMarketLiveArchive(undefined, file)).toEqual({ dates: [], day: null });
    expect(await recordMarketLiveArchive({
      now: at("15:21:08"), file, collect: async () => board("15:21:09", [stock("005930", "15:21:04", 101)], "auction"),
    })).toMatchObject({ status: "recorded" });
  });

  it("다른 비교 기준일과 마감 시각에 받은 응답은 저장하지 않는다", async () => {
    expect(await recordMarketLiveArchive({
      now: at("14:10:08"), file, collect: async () => ({ ...board("14:10:09", [stock("005930", "14:10:08", 103)]), baselineDate: "2026-11-16" }),
    })).toMatchObject({ status: "missing" });
    expect(await recordMarketLiveArchive({
      now: at("15:29:59"), file, collect: async () => board("15:30:00", [stock("005930", "15:30:00", 103)]),
    })).toMatchObject({ status: "missing" });
    expect(readMarketLiveArchive(undefined, file)).toEqual({ dates: [], day: null });
  });
});
