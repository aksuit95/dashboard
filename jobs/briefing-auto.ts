import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildBriefing } from "@/lib/market/briefing-report";
import { scheduledBriefings } from "@/lib/market/briefing-schedule";

const root = process.cwd();
const store = path.join(root, "output", "briefing-auto");
const sourceRoots = [root, path.join(root, "tmp", "investor-flow-runner")];
const runtime = process.env.BRIEFING_PYTHON;
async function main() {
  if (!runtime) throw new Error("BRIEFING_PYTHON 환경변수가 설정되지 않았습니다.");
  const now = new Date();
  const schedule = scheduledBriefings(now);
  if (!schedule.length) { console.log("거래일 마감 이후가 아니므로 생성하지 않습니다."); return; }
  await fs.mkdir(store, { recursive: true });
  for (const entry of schedule) {
    const name = `${entry.type}-${entry.period.end}`;
    const json = path.join(store, `${name}.json`), pdf = path.join(store, `${name}.pdf`);
    if (await fs.stat(json).then(() => fs.stat(pdf)).then(() => true).catch(() => false)) { console.log(`${name}: 이미 생성됨`); continue; }
    const candidates = await Promise.all(sourceRoots.map(dir => buildBriefing(entry.type, entry.period.end, dir, now)));
    const report = candidates[0];
    for (const key of ["indices", "sectors", "flows"] as const) {
      for (let i = 0; i < report[key].length; i++) {
        if (report[key][i].error && !candidates[1][key][i].error) Object.assign(report[key][i], candidates[1][key][i]);
      }
    }
    if (report.indices.some(x => x.error)) { console.error(`${name}: 필수 KRX 지수 자료 대기`); process.exitCode = 1; continue; }
    // Give independently scheduled sector and flow collectors time to publish.
    const localHour = new Date(now.getTime() + 9 * 3600000).getUTCHours();
    if (localHour < 20 && (report.sectors.some(x => x.error) || report.flows.some(x => x.error))) { console.error(`${name}: 선택 자료 대기, 20시까지 재시도`); process.exitCode = 1; continue; }
    const input = path.join(store, `.${name}.${process.pid}.tmp.json`), output = path.join(store, `.${name}.${process.pid}.tmp.pdf`);
    try {
      await fs.writeFile(input, JSON.stringify(report), { flag: "wx" });
      const generated = spawnSync(runtime, [path.join(root, "scripts", "briefing-pdf.py"), input, output], { encoding: "utf8", timeout: 120000 });
      if (generated.error || generated.status !== 0 || !(await fs.stat(output).then(x => x.size > 1000).catch(() => false))) throw new Error(`PDF 생성 실패: ${generated.stderr || generated.error?.message || generated.status}`);
      await fs.rename(output, pdf);
      await fs.rename(input, json);
      console.log(`${name}: 자동 생성 완료`);
    } finally { await fs.unlink(input).catch(() => {}); await fs.unlink(output).catch(() => {}); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
