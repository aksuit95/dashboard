import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { ingestQuotes } from "@/lib/ingest/run";

loadEnv();

const interval = Number(process.env.POLL_INTERVAL_MS || 20_000);
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const reports = await ingestQuotes(getDb());
    console.log(new Date().toISOString(), reports.map((report) => `${report.source}:${report.status}`).join(" "));
  } catch (error) {
    console.error(error);
  } finally {
    running = false;
  }
}

void tick();
setInterval(() => {
  void tick();
}, interval);
