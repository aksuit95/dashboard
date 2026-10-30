import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { ingestQuotes } from "@/lib/ingest/run";

loadEnv();

async function main(): Promise<void> {
  const reports = await ingestQuotes(getDb());
  for (const report of reports) {
    console.log(`${report.status}\t${report.source}\t${report.message}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
