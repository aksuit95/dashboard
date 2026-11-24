import fs from "node:fs/promises";
import path from "node:path";
import { readBriefingArchive, briefingIdPattern, briefingDirectories, deletedBriefingIds, writeBriefingDeletionState } from "@/lib/market/briefing-archive";
import { buildLocalBriefing, writeBriefingFiles } from "@/lib/market/briefing-generation";
export const dynamic = "force-dynamic";
const changing = new Set<string>();

function localOrigin(request: Request) {
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") return null;
  const listener = process.env.__NEXT_PRIVATE_ORIGIN;
  // Next uses localhost for its internal request URL and can preserve the IP in Host.
  // Only an explicitly IPv4-loopback-bound listener can enable the write route.
  if (!listener || !/^https?:\/\/127\.0\.0\.1:\d+$/.test(listener)) return null;
  const url = new URL(request.url);
  const port = new URL(listener).port;
  const host = request.headers.get("host");
  return url.port === port && (host === `localhost:${port}` || host === `127.0.0.1:${port}`)
    ? `${url.protocol}//${host}` : null;
}

function mayChange(request: Request) {
  const origin = localOrigin(request);
  return origin !== null && request.headers.get("origin") === origin;
}

export async function GET(request: Request) {
  const { local: dir, shared } = briefingDirectories();
  try {
    const [archived, deleted] = await Promise.all([readBriefingArchive(shared), deletedBriefingIds(dir, shared)]);
    const names = (await fs.readdir(dir).catch(e => { if (e.code === "ENOENT") return [] as string[]; throw e; })).filter(x => x.endsWith(".json") && briefingIdPattern.test(x.slice(0, -5))).sort().reverse();
    const reports = await Promise.all(names.map(async name => {
      try {
        const id = name.slice(0, -5);
        await fs.access(path.join(dir, `${id}.pdf`));
        return { id, report: JSON.parse(await fs.readFile(path.join(dir, name), "utf8")) };
      } catch { return null; }
    }));
    const merged = new Map(archived.map(entry => [entry.id, entry]));
    for (const entry of reports) if (entry) merged.set(entry.id, entry);
    const canDelete = localOrigin(request) !== null;
    return Response.json({
      reports: [...merged.values()].filter(entry => !deleted.has(entry.id)).sort((a, b) => b.id.localeCompare(a.id)),
      canDelete,
      deleted: canDelete ? [...deleted].sort((a, b) => b.slice(-10).localeCompare(a.slice(-10))) : [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return Response.json({ reports: [] });
    return Response.json({ error: "자동 생성 이력을 읽지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!mayChange(request)) {
    return Response.json({ error: "이 PC의 로컬 대시보드에서 삭제할 수 있습니다." }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!briefingIdPattern.test(id)) return Response.json({ error: "잘못된 브리핑입니다." }, { status: 400 });
  if (changing.has(id)) return Response.json({ error: "브리핑을 처리 중입니다." }, { status: 409 });
  const { local, shared } = briefingDirectories();
  changing.add(id);
  try {
    const deleted = await deletedBriefingIds(local, shared);
    if (!deleted.has(id)) {
      const response = await GET(request);
      if (!response.ok) throw new Error("브리핑 확인 실패");
      const { reports } = await response.json();
      if (!reports.some((entry: { id: string }) => entry.id === id)) {
        return Response.json({ error: "브리핑을 찾을 수 없습니다." }, { status: 404 });
      }
      await writeBriefingDeletionState(local, id);
    }
    await Promise.all(["json", "pdf"].map(extension => fs.rm(path.join(local, `${id}.${extension}`), { force: true })));
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "브리핑 삭제를 완료하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  } finally { changing.delete(id); }
}

export async function POST(request: Request) {
  if (!mayChange(request)) return Response.json({ error: "이 PC의 로컬 대시보드에서 다시 생성할 수 있습니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!briefingIdPattern.test(id)) return Response.json({ error: "잘못된 브리핑입니다." }, { status: 400 });
  if (changing.has(id)) return Response.json({ error: "브리핑을 처리 중입니다." }, { status: 409 });
  const { local, shared } = briefingDirectories();
  changing.add(id);
  try {
    if (!(await deletedBriefingIds(local, shared)).has(id)) {
      return Response.json({ error: "삭제한 브리핑을 찾을 수 없습니다." }, { status: 404 });
    }
    const report = await buildLocalBriefing(id.startsWith("daily-") ? "daily" : "weekly", id.slice(id.indexOf("-") + 1), process.cwd(), new Date());
    if (id !== `${report.type}-${report.period.end}`) return Response.json({ error: "원래 기준일의 브리핑을 만들 수 없습니다." }, { status: 409 });
    await writeBriefingFiles(process.cwd(), report);
    await writeBriefingDeletionState(local, id, true);
    return Response.json({ id, report });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "브리핑을 다시 생성하지 못했습니다." }, { status: 500 });
  } finally { changing.delete(id); }
}
