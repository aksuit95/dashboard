import type { AppDatabase } from "@/lib/db/client";
import type { NaverIndex, NaverRank } from "@/lib/sources/naver";

export function replaceNaverRanks(db: AppDatabase, market: string, rows: NaverRank[], asOf: string): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM naver_ranks WHERE market = ?").run(market);
    const insert = db.prepare(`
      INSERT INTO naver_ranks (market, item_code, rank, name, price, change_pct, market_cap_krw, as_of)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      insert.run(market, row.itemCode, row.rank, row.name, row.price, row.changePct, row.marketCapKrw, asOf);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function upsertNaverIndex(db: AppDatabase, index: NaverIndex, asOf: string): void {
  db.prepare(`
    INSERT INTO naver_indexes (item_code, name, price, change_pct, as_of)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(item_code) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      change_pct = excluded.change_pct,
      as_of = excluded.as_of
  `).run(index.itemCode, index.name, index.price, index.changePct, asOf);
}

export function upsertNaverBreadth(db: AppDatabase, row: { market: string; date: string; advancers: number; decliners: number; unchanged: number }): void {
  db.prepare(`
    INSERT INTO breadth_daily (market, date, advancers, decliners, unchanged)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(market, date) DO UPDATE SET
      advancers = excluded.advancers,
      decliners = excluded.decliners,
      unchanged = excluded.unchanged
  `).run(row.market, row.date, row.advancers, row.decliners, row.unchanged);
}
