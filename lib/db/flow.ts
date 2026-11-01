import type { AppDatabase } from "@/lib/db/client";
import type { FlowPoint } from "@/lib/sources/flow";

/** 이번 수집에 없는 칸은 이전 값을 유지한다. 빈 값을 0으로 바꾸지 않는다. */
export function upsertFlows(db: AppDatabase, rows: FlowPoint[]): void {
  const statement = db.prepare(`
    INSERT INTO flow_daily (date, deposits, credit_balance, credit_mcap_pct, kospi_value, kosdaq_value)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      deposits = COALESCE(excluded.deposits, flow_daily.deposits),
      credit_balance = COALESCE(excluded.credit_balance, flow_daily.credit_balance),
      credit_mcap_pct = COALESCE(excluded.credit_mcap_pct, flow_daily.credit_mcap_pct),
      kospi_value = COALESCE(excluded.kospi_value, flow_daily.kospi_value),
      kosdaq_value = COALESCE(excluded.kosdaq_value, flow_daily.kosdaq_value)
  `);
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      statement.run(row.date, row.deposits, row.credit, row.creditPct, row.kospi, row.kosdaq);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
