import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { minerviniUniverseIds } from "@/config/minervini";
import { loadSectors } from "@/lib/sources/sector-returns-daily";

loadEnv();
async function main() {
  for (const universe of minerviniUniverseIds) {
    const board = await loadSectors(getDb(), new Date(), fetch, universe);
    console.log(JSON.stringify({ universe, ok: !board.stale, asOf: board.snapshot?.asOf, members: board.snapshot?.rows.length, error: board.error }));
    if (board.stale) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
