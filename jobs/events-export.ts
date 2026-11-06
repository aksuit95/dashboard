import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { addDays, seoulDate } from "@/lib/events/calendar";
import { ISM_URL, parseIsm, refreshFeed, type Snapshot } from "@/lib/events/refresh";
import { parseShowMyTrades, SHOWMYTRADES_URL } from "@/lib/events/showmytrades";

const path = "data/events/board.json";
async function download(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "research-dashboard/1.0", Accept: "application/json, text/html" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.text();
}
async function main() {
  let prior: Snapshot = { feeds: {} };
  try { prior = JSON.parse(await readFile(path, "utf8")) as Snapshot; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const current = new Date(), now = current.toISOString(), today = seoulDate(current);
  let generatedAt: string | undefined;
  const [show, ism] = await Promise.all([
    refreshFeed(prior.feeds.show, async () => { const parsed = parseShowMyTrades(JSON.parse(await download(SHOWMYTRADES_URL)), current); generatedAt = parsed.generatedAt; return parsed.events; }, now),
    refreshFeed(prior.feeds.ism, async () => parseIsm(await download(ISM_URL)), now),
  ]);
  show.generatedAt = generatedAt ?? prior.feeds.show?.generatedAt;
  const snapshot: Snapshot = { feeds: { show, ism } };
  await mkdir("data/events", { recursive:true });
  await writeFile(`${path}.tmp`, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  await rename(`${path}.tmp`, path);
  console.log(JSON.stringify({ period:[today, addDays(today,27)], show:{count:show.events.length,error:show.error}, ism:{count:ism.events.length,error:ism.error} }));
  if (show.error || ism.error) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
