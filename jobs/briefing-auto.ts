import fs from "node:fs/promises";
import path from "node:path";
import { buildLocalBriefing, writeBriefingFiles } from "@/lib/market/briefing-generation";
import { scheduledBriefings } from "@/lib/market/briefing-schedule";
import { briefingDirectories, deletedBriefingIds } from "@/lib/market/briefing-archive";

const root = process.cwd();
const { local: store, shared } = briefingDirectories(root);
const publisherRoot = path.join(root, "tmp", "briefing-publisher");
const publisherArchive = briefingDirectories(publisherRoot).shared;
async function main() {
  const now = new Date();
  const schedule = scheduledBriefings(now);
  if (!schedule.length) { console.log("거래일 마감 이후가 아니므로 생성하지 않습니다."); return; }
  await fs.mkdir(store, { recursive: true });
  for (const entry of schedule) {
    const name = `${entry.type}-${entry.period.end}`;
    if ((await deletedBriefingIds(store, shared, publisherArchive)).has(name)) continue;
    const published = [store, shared, publisherArchive].map(dir =>
      fs.access(path.join(dir, `${name}.json`)).then(() => fs.access(path.join(dir, `${name}.pdf`))).then(() => true).catch(() => false));
    if ((await Promise.all(published)).some(Boolean)) { console.log(`${name}: 이미 생성됨`); continue; }
    try {
      const report = await buildLocalBriefing(entry.type, entry.period.end, root, now);
      const optionalDeadline = Date.parse(`${entry.period.end}T20:00:00+09:00`);
      if (!report.indices.some(x => x.error) && now.getTime() < optionalDeadline &&
        (report.sectors.some(x => x.error) || report.flows.some(x => x.error))) throw new Error("선택 자료 대기, 20시까지 재시도");
      if (await writeBriefingFiles(root, report, async () => !(await deletedBriefingIds(store, shared, publisherArchive)).has(name))) {
        console.log(`${name}: 자동 생성 완료`);
      }
    } catch (error) {
      console.error(`${name}: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
