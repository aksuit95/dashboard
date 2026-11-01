import type { AppDatabase } from "@/lib/db/client";

export type MonthlyPoint = {
  key: string;
  period: string;
  value: number;
  unit: string;
  label: string;
  extra: string | null;
};

export function upsertMonthly(db: AppDatabase, source: string, rows: MonthlyPoint[]): void {
  const statement = db.prepare(`
    INSERT INTO monthly_series (source, series_key, period, value, unit, label, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, series_key, period) DO UPDATE SET
      value = excluded.value,
      unit = excluded.unit,
      label = excluded.label,
      extra_json = excluded.extra_json
  `);
  db.exec("BEGIN");
  try {
    for (const row of rows) statement.run(source, row.key, row.period, row.value, row.unit, row.label, row.extra);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
