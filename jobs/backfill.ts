import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { backfillHistory } from "@/lib/ingest/run";

loadEnv();

async function main(): Promise<void> {
  const range = process.argv[2] || "5y";
  const reports = await backfillHistory(getDb(), range);
  const failed = reports.filter((report) => report.status !== "ok");
  console.log(`일별 적재 ${reports.length - failed.length}/${reports.length}`);
  for (const report of failed) console.log(`${report.status}\t${report.source}\t${report.message}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
