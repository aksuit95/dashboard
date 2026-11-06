import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { addDays, seoulDate } from "@/lib/events/calendar";
import { refreshFeed, type Snapshot } from "@/lib/events/refresh";
import { loadEnv } from "@/lib/env";
import { collectDartEarnings } from "@/lib/events/dart-earnings";
import { headlineIsm, mergeRecentEvents, parseShowMyTrades, SHOWMYTRADES_URL } from "@/lib/events/showmytrades";

const path = "data/events/board.json";
async function download(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "research-dashboard/1.0", Accept: "application/json, text/html" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.text();
}
async function main() {
  loadEnv();
  let prior: Snapshot = { feeds: {} };
  try { prior = JSON.parse(await readFile(path, "utf8")) as Snapshot; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const current = new Date(), now = current.toISOString(), today = seoulDate(current);
  const macroOnly = process.argv.includes("--macro-only");
  let generatedAt: string | undefined;
  const [show, dart] = await Promise.all([
    refreshFeed(prior.feeds.show, async () => { const parsed = parseShowMyTrades(JSON.parse(await download(SHOWMYTRADES_URL)), current); generatedAt = parsed.generatedAt; return mergeRecentEvents(prior.feeds.show?.events ?? [], parsed.events, current); }, now),
    macroOnly ? Promise.resolve(prior.feeds.dart ?? {updatedAt:null,error:null,capAsOf:null,companies:[],events:[]}) : collectDartEarnings(current).catch(error => ({updatedAt:prior.feeds.dart?.updatedAt ?? null, error:error instanceof Error ? error.message : "DART 수집 실패", capAsOf:prior.feeds.dart?.capAsOf ?? null, companies:prior.feeds.dart?.companies ?? [], events:prior.feeds.dart?.events ?? []})),
  ]);
  show.generatedAt = generatedAt ?? prior.feeds.show?.generatedAt;
  const ism = await refreshFeed(prior.feeds.ism, async () => {
    if(show.error) throw new Error("ShowMyTrades 일정 수집 실패");
    const found = headlineIsm(show.events);
    if(!found.length) throw new Error("제공처에서 ISM PMI 일정을 찾지 못했습니다");
    return found;
  }, now);
  ism.generatedAt = show.generatedAt ?? prior.feeds.ism?.generatedAt;
  const snapshot: Snapshot = { feeds: { ...prior.feeds, show, ism, dart } };
  await mkdir("data/events", { recursive:true });
  await writeFile(`${path}.tmp`, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  await rename(`${path}.tmp`, path);
  console.log(JSON.stringify({ period:[today, addDays(today,27)], show:{count:show.events.length,error:show.error}, ism:{count:ism.events.length,error:ism.error}, dart:{count:dart.events.length,error:dart.error,companies:dart.companies?.length ?? 0,capAsOf:dart.capAsOf} }));
  if (show.error || ism.error || (!macroOnly && dart.error)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

