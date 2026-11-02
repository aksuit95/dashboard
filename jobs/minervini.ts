import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { loadMinervini } from "@/lib/sources/minervini-daily";
import { minerviniUniverseIds } from "@/config/minervini";

loadEnv();
async function main() {
  for (const universe of minerviniUniverseIds) {
    const board = await loadMinervini(getDb(), new Date(), fetch, universe);
    console.log(JSON.stringify({ universe, ok: !board.stale, asOf: board.snapshot?.asOf, members: board.snapshot?.universeSize, ranked: board.snapshot?.rankedSize, error: board.error }));
    if (board.stale) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
