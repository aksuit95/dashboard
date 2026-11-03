import fs from "node:fs/promises";
import path from "node:path";
import { minerviniUniverseIds, minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";
import { minerviniSession } from "@/lib/market/minervini-session";
import { fetchMinerviniSnapshot, minerviniSnapshotVersion, type MinerviniSnapshot } from "./minervini";
import type { MinerviniBoard } from "./minervini-daily";

type Publication = { version: 1; snapshots: Partial<Record<MinerviniUniverse, MinerviniSnapshot>> };
export const minerviniPublicationPath = path.join(process.cwd(), "data", "minervini", "board.json");

export function validateMinerviniPublication(value: unknown): Publication {
  const data = value as Publication;
  if (data?.version !== 1 || !data.snapshots || typeof data.snapshots !== "object") throw new Error("미너비니 배포 데이터 형식 오류");
  for (const universe of minerviniUniverseIds) {
    const snapshot = data.snapshots[universe];
    if (!snapshot) continue;
    const spec = minerviniUniverses[universe];
    if (snapshot.version !== minerviniSnapshotVersion || snapshot.priceBasis !== "KRX_REGULAR_CLOSE" || snapshot.universe !== universe || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf) || !Number.isFinite(Date.parse(snapshot.fetchedAt)) || !Array.isArray(snapshot.rows) || snapshot.universeSize < spec.minSize || snapshot.universeSize > spec.maxSize || snapshot.rows.length !== snapshot.universeSize || new Set(snapshot.rows.map(row => row.code)).size !== snapshot.rows.length) throw new Error(`${universe} 미너비니 KRX 스냅샷 검증 실패`);
  }
  return data;
}

export async function readMinerviniPublication(file = minerviniPublicationPath): Promise<Publication | null> {
  try { return validateMinerviniPublication(JSON.parse(await fs.readFile(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function readPublishedMinervini(universe: MinerviniUniverse, now = new Date(), file = minerviniPublicationPath): Promise<MinerviniBoard> {
  let expectedDate: string;
  try { expectedDate = minerviniSession(now); }
  catch (error) { return { snapshot: null, stale: true, expectedDate: null, error: (error as Error).message }; }
  const publication = await readMinerviniPublication(file);
  const candidate = publication?.snapshots[universe];
  const snapshot = candidate && candidate.asOf <= expectedDate ? candidate : null;
  const stale = snapshot?.asOf !== expectedDate;
  return { snapshot, stale, expectedDate, error: stale ? "예약 수집·배포 대기 중입니다. 마지막 저장 결과의 기준일을 확인하세요." : null };
}

export async function exportMinerviniPublication(file = minerviniPublicationPath, now = new Date(), collect = fetchMinerviniSnapshot) {
  const asOf = minerviniSession(now);
  const previous = await readMinerviniPublication(file);
  const snapshots = { ...previous?.snapshots };
  const errors: string[] = [];
  let changed = false;
  for (const universe of minerviniUniverseIds) {
    if (snapshots[universe]?.asOf === asOf) continue;
    if (snapshots[universe] && snapshots[universe]!.asOf > asOf) { errors.push(`${universe}: 배포 기준일 역행`); continue; }
    try {
      const snapshot = await collect(asOf, fetch, now, universe);
      validateMinerviniPublication({ version: 1, snapshots: { [universe]: snapshot } });
      if (snapshot.asOf !== asOf) throw new Error("미너비니 수집 기준일 불일치");
      snapshots[universe] = snapshot;
      changed = true;
    } catch (error) { errors.push(`${universe}: ${error instanceof Error ? error.message : "수집 실패"}`); }
  }
  if (changed) {
    const publication = validateMinerviniPublication({ version: 1, snapshots });
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(publication) + "\n", { flag: "wx" }); await fs.rename(temporary, file); }
    finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  return { asOf, changed, ok: errors.length === 0, errors };
}
