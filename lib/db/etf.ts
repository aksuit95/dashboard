import type { AppDatabase } from "@/lib/db/client";

export type EtfHoldingRow = {
  symbol: string;
  name: string;
  weight: number;
};

/** 같은 ETF·같은 날짜만 교체한다. 다른 날짜의 비중은 남긴다. */
export function replaceEtfHoldings(db: AppDatabase, etfSymbol: string, asOf: string, rows: EtfHoldingRow[]): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM etf_holdings WHERE etf_symbol = ? AND as_of = ?").run(etfSymbol, asOf);
    const insert = db.prepare(`
      INSERT INTO etf_holdings (etf_symbol, as_of, constituent_symbol, constituent_name, weight)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of rows) insert.run(etfSymbol, asOf, row.symbol, row.name, row.weight);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
