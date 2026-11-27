import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { addDays, seoulDate } from "@/lib/events/calendar";
import { refreshFeed, shouldRefreshDart, type Feed, type Snapshot } from "@/lib/events/refresh";
import { loadEnv } from "@/lib/env";
import { collectDartEarnings } from "@/lib/events/dart-earnings";
import { headlineIsm, mergeRecentEvents, parseShowMyTrades, SHOWMYTRADES_URL } from "@/lib/events/showmytrades";
import { refreshKoreanMacroFeeds } from "@/lib/events/korean-macro";
import { collectMyfxbookConsensus, type KoreanConsensusQuote } from "@/lib/events/korean-consensus";

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
  const koreanMacroOnly = process.argv.includes("--kr-macro-only");
  async function refreshKoreanMacro() {
    let quotes: KoreanConsensusQuote[] | null = null;
    const krConsensus = await refreshFeed(prior.feeds.krConsensus, async () => {
      quotes = await collectMyfxbookConsensus(today);
      return [];
    }, now);
    const official = await refreshKoreanMacroFeeds(prior.feeds, current, download, quotes);
    return { ...official, krConsensus };
  }
  const refreshDart = shouldRefreshDart(macroOnly, prior.feeds.dart);
  let generatedAt: string | undefined;
  // Extra US macro runs do not refresh any of the Korean macro feeds.
  const krPromise: Promise<Record<string, Feed>> = macroOnly && !koreanMacroOnly ? Promise.resolve({}) : refreshKoreanMacro();
  const [show, dart] = koreanMacroOnly ? [prior.feeds.show, prior.feeds.dart] : await Promise.all([
    refreshFeed(prior.feeds.show, async () => { const parsed = parseShowMyTrades(JSON.parse(await download(SHOWMYTRADES_URL)), current); generatedAt = parsed.generatedAt; return mergeRecentEvents(prior.feeds.show?.events ?? [], parsed.events, current); }, now),
    !refreshDart ? Promise.resolve(prior.feeds.dart!) : collectDartEarnings(current).catch(error => ({updatedAt:prior.feeds.dart?.updatedAt ?? null, error:error instanceof Error ? error.message : "DART 수집 실패", capAsOf:prior.feeds.dart?.capAsOf ?? null, companies:prior.feeds.dart?.companies ?? [], events:prior.feeds.dart?.events ?? []})),
  ]);
  if (show && !koreanMacroOnly) show.generatedAt = generatedAt ?? prior.feeds.show?.generatedAt;
  const ism = koreanMacroOnly ? prior.feeds.ism : await refreshFeed(prior.feeds.ism, async () => {
    if(show.error) throw new Error("ShowMyTrades 일정 수집 실패");
    const found = headlineIsm(show.events);
    if(!found.length) throw new Error("제공처에서 ISM PMI 일정을 찾지 못했습니다");
    return found;
  }, now);
  if (ism && !koreanMacroOnly) ism.generatedAt = show.generatedAt ?? prior.feeds.ism?.generatedAt;
  const krFeeds = await krPromise;
  const snapshot: Snapshot = { feeds: { ...prior.feeds, ...(!koreanMacroOnly ? { show, ism, dart } : {}), ...krFeeds } };
  await mkdir("data/events", { recursive:true });
  await writeFile(`${path}.tmp`, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  await rename(`${path}.tmp`, path);
  const summary = (feed: Feed | undefined) => ({count:feed?.events.length ?? 0,error:feed?.error ?? null});
  console.log(JSON.stringify({ period:[today, addDays(today,27)], show:summary(show), ism:summary(ism), dart:summary(dart),
    korea:Object.fromEntries(Object.entries(krFeeds).map(([key, feed]) => [key, {...summary(feed), results:feed.events.filter(event => event.actual).length}])) }));
  if ((!koreanMacroOnly && (show?.error || ism?.error || (refreshDart && dart?.error))) ||
    Object.values(krFeeds).some(feed => feed.error)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

