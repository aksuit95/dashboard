import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { briefingDirectories } from "./briefing-archive";
import { buildBriefing } from "./briefing-report";

const run = promisify(execFile);
type Report = Awaited<ReturnType<typeof buildBriefing>>;

export async function buildLocalBriefing(type: Report["type"], date: string, root: string, now: Date) {
  const sources = [root, path.join(root, "tmp", "investor-flow-runner"), path.join(root, "tmp", "briefing-publisher")];
  const [report, ...fallbacks] = await Promise.all(sources.map(dir => buildBriefing(type, date, dir, now)));
  for (const key of ["indices", "sectors", "flows"] as const) {
    for (let i = 0; i < report[key].length; i++) {
      if (!report[key][i].error) continue;
      const available = fallbacks.map(candidate => candidate[key][i]).find(item => !item.error);
      if (available) Object.assign(report[key][i], available);
    }
  }
  return report;
}

async function briefingPython() {
  const configured = process.env.BRIEFING_PYTHON;
  if (configured && await fs.access(configured).then(() => true).catch(() => false)) return configured;
  const programFiles = process.env.ProgramFiles;
  if (process.platform === "win32" && programFiles) {
    const directory = path.join(programFiles, "WindowsApps");
    const runtimes = await fs.readdir(directory).catch(() => []);
    const ordered = runtimes.filter(name => name.startsWith("OpenAI.CodexPrimaryRuntime."))
      .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    for (const runtime of ordered) {
      const executable = path.join(directory, runtime, "dependencies", "python", "python.exe");
      if (await fs.access(executable).then(() => true).catch(() => false)) return executable;
    }
  }
  throw new Error("브리핑 PDF를 만드는 Python 실행 파일을 찾을 수 없습니다.");
}

export async function writeBriefingFiles(root: string, report: Report, canWrite: () => Promise<boolean> = async () => true) {
  const missing = report.indices.find(index => index.error);
  if (missing) throw new Error("필수 KRX 지수 자료 대기 · " + missing.error);
  const python = await briefingPython();
  const { local } = briefingDirectories(root);
  await fs.mkdir(local, { recursive: true });
  const id = report.type + "-" + report.period.end;
  const temporary = path.join(local, "." + id + "." + randomUUID());
  const input = temporary + ".tmp.json";
  const output = temporary + ".tmp.pdf";
  try {
    await fs.writeFile(input, JSON.stringify(report), { flag: "wx" });
    await run(python, [path.join(root, "scripts", "briefing-pdf.py"), input, output], { timeout: 120_000, windowsHide: true })
      .catch(() => { throw new Error("브리핑 PDF를 생성하지 못했습니다."); });
    if ((await fs.stat(output)).size <= 1000) throw new Error("브리핑 PDF가 비어 있습니다.");
    if (!await canWrite()) return false;
    await fs.rename(output, path.join(local, id + ".pdf"));
    await fs.rename(input, path.join(local, id + ".json"));
    return true;
  } finally {
    await Promise.all([input, output].map(file => fs.rm(file, { force: true }).catch(() => {})));
  }
}
