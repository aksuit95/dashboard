import { readFile, writeFile, rename } from "node:fs/promises";
import { collectDartEarnings } from "@/lib/events/dart-earnings";
import { reviewedCloseSession as minerviniSession } from "@/lib/market/reviewed-close-session";
import { type Snapshot } from "@/lib/events/refresh";
import { loadEnv } from "@/lib/env";

const path = "data/events/board.json";
async function main() {
  loadEnv();
  const now = new Date();
  const prior = JSON.parse(await readFile(path, "utf8")) as Snapshot;
  const old = prior.feeds.dart;
  const age = now.getTime() - Date.parse(old?.updatedAt ?? "");
  if (old && !old.error && old.capAsOf === minerviniSession(now) && age >= 0 && age < 24 * 60 * 60 * 1000) {
    console.log(JSON.stringify({ skipped: true, updatedAt: old.updatedAt, capAsOf: old.capAsOf }));
    return;
  }
  // Never replace a working snapshot with an error or an incomplete response.
  const dart = await collectDartEarnings(now);
  if (dart.error || dart.companies.length !== 30) throw new Error("DART 결과 검증 실패");
  const snapshot: Snapshot = { feeds: { ...prior.feeds, dart } };
  await writeFile(`${path}.tmp`, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  await rename(`${path}.tmp`, path);
  console.log(JSON.stringify({ skipped: false, updatedAt: dart.updatedAt, capAsOf: dart.capAsOf, companies: dart.companies.length, events: dart.events.length }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "DART 수집 실패"); process.exitCode = 1; });
