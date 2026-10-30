import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { importBreadth, importOverseas } from "@/lib/imports/load";

describe("CSV 임포트", () => {
  it("숫자가 깨진 행이 있으면 배치 전체를 거절한다", () => {
    const db = openDatabase(":memory:");
    const bad = "market,date,advancers,decliners,unchanged\nKOSPI,2026-10-01,10,x,1\nKOSPI,2026-10-02,1,1,1";
    const result = importBreadth(db, bad);
    expect(result.ok).toBe(false);
    const count = db.prepare("SELECT COUNT(*) AS n FROM breadth_daily").get() as { n: number };
    expect(count.n).toBe(0);
    db.close();
  });

  it("같은 기준일을 다시 올리면 그 배치만 교체한다", () => {
    const db = openDatabase(":memory:");
    const first = "window,as_of,rank,name,buy,sell,net\ndaily,2026-10-28,1,Alpha,10,2,8\ndaily,2026-10-28,2,Beta,5,5,0";
    const second = "window,as_of,rank,name,buy,sell,net\ndaily,2026-10-28,1,Gamma,3,1,2";
    expect(importOverseas(db, first).ok).toBe(true);
    expect(importOverseas(db, second).ok).toBe(true);
    const rows = db.prepare("SELECT name FROM overseas_trades ORDER BY rank").all() as { name: string }[];
    expect(rows.map((row) => row.name)).toEqual(["Gamma"]);
    db.close();
  });

  it("헤더가 다르면 거절한다", () => {
    const db = openDatabase(":memory:");
    const result = importBreadth(db, "a,b\n1,2");
    expect(result.ok).toBe(false);
    db.close();
  });
});
