import { readFile, writeFile } from "node:fs/promises";
import { type Snapshot } from "@/lib/events/refresh";

async function main() {
  const path = "data/events/board.json";
  const capturedPath = process.argv[2];
  if (!capturedPath) throw new Error("DART snapshot path required");
  const current = JSON.parse(await readFile(path, "utf8")) as Snapshot;
  const captured = JSON.parse(await readFile(capturedPath, "utf8")) as Snapshot;
  const prior = current.feeds.dart, dart = captured.feeds.dart;
  if (!dart || dart.error || !dart.updatedAt || !Number.isFinite(Date.parse(dart.updatedAt)) || dart.companies?.length !== 30) throw new Error("Invalid DART snapshot");
  if (!prior || !prior.updatedAt || !Number.isFinite(Date.parse(prior.updatedAt)) || Date.parse(dart.updatedAt) > Date.parse(prior.updatedAt)) {
    current.feeds.dart = dart;
    await writeFile(path, JSON.stringify(current, null, 2) + "\n", "utf8");
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "DART merge failed"); process.exitCode = 1; });
