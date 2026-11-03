import { collectInvestorDaily } from "@/lib/sources/investor-flow-daily";
import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { ingestQuotes } from "@/lib/ingest/run";
import { loadMinervini } from "@/lib/sources/minervini-daily";
import { minerviniUniverseIds } from "@/config/minervini";
import { loadSectors } from "@/lib/sources/sector-returns-daily";

loadEnv();

async function main(): Promise<void> {
  const investorFlow = await collectInvestorDaily(getDb());
  if (!investorFlow.ok) { console.error("investor-flow", investorFlow.error); process.exitCode = 1; }
  const reports = await ingestQuotes(getDb());
  for (const report of reports) {
    console.log(`${report.status}\t${report.source}\t${report.message}`);
  }
  for (const universe of minerviniUniverseIds) {
    const board = await loadMinervini(getDb(), new Date(), fetch, universe);
    console.log(`minervini:${universe}\t${board.snapshot?.asOf ?? "—"}\t${board.error ?? "ok"}`);
    if (board.stale) process.exitCode = 1;
    const sectors = await loadSectors(getDb(), new Date(), fetch, universe);
    console.log(`sectors:${universe}\t${sectors.snapshot?.asOf ?? "—"}\t${sectors.error ?? "ok"}`);
    if (sectors.stale) process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
