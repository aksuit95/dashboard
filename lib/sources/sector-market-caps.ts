import fs from "node:fs/promises";
import path from "node:path";
import { krxClient } from "@/lib/sources/krx-client";
import { readSectorPublication } from "@/lib/sources/sector-publication";
import { atomicJson } from "@/lib/financials/source";

type CapRow = { close: number; cap: number };
type Publication = { version: 2; exchange: "KRX"; priceBasis: "KRX_REGULAR_CLOSE"; priceTime: "15:30 KST"; fetchedAt: string; dates: Record<string, Record<string, CapRow>> };
export const sectorCapsPath = path.join(process.cwd(), "data", "sectors", "market-caps.json");
export function parseSectorCaps(payload: unknown, market: "STK" | "KSQ"): Record<string, CapRow> {
  const rows = (payload as { OutBlock_1?: Record<string, unknown>[] })?.OutBlock_1;
  if (!Array.isArray(rows) || rows.length < 10) throw new Error("KRX 시장별 시총 자료 부족");
  const result: Record<string, CapRow> = {};
  for (const row of rows) {
    const code = String(row.ISU_SRT_CD ?? "");
    if (!/^[0-9A-Z]{6}$/.test(code) || row.MKT_ID !== market || Object.hasOwn(result, code)) throw new Error("KRX 시총 종목·시장 오류");
    const num = (value: unknown) => { const s = String(value ?? "").replaceAll(",", ""); return /^\d+$/.test(s) ? Number(s) : NaN; };
    const close = num(row.TDD_CLSPRC), cap = num(row.MKTCAP), shares = num(row.LIST_SHRS);
    if ([close, cap, shares].every(Number.isSafeInteger) && close > 0 && cap > 0 && shares > 0 && close * shares === cap) result[code] = { close, cap };
  }
  if (Object.keys(result).length < 10) throw new Error("KRX 시총 유효 종목 부족");
  return result;
}
export async function readSectorCaps(): Promise<Publication | null> {
  try {
    const p = JSON.parse(await fs.readFile(sectorCapsPath, "utf8")) as Publication;
    if (p.version !== 2 || p.exchange !== "KRX" || p.priceBasis !== "KRX_REGULAR_CLOSE" || p.priceTime !== "15:30 KST" || !p.dates || !Number.isFinite(Date.parse(p.fetchedAt))) throw new Error("KRX 시총 이력 파일 오류");
    return p;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export function matchingCaps(rows: { code: string; price: number | null }[], caps: Record<string, CapRow> | undefined): Record<string, number> {
  return Object.fromEntries(rows.flatMap(row => { const item = caps?.[row.code]; return item && Number.isSafeInteger(item.cap) && item.cap > 0 && item.close === row.price ? [[row.code, item.cap]] : []; }));
}
export async function collectSectorCaps() {
  const sectors = await readSectorPublication();
  if (!sectors) throw new Error("섹터 자료 없음");
  const dates = Object.keys(sectors.snapshots.kospi200).sort();
  const old = await readSectorCaps().catch(() => null);
  const collected: Publication["dates"] = {};
  for (const date of dates) {
    if (old?.dates[date]) { collected[date] = old.dates[date]; continue; }
    const day: Record<string, CapRow> = {};
    for (const market of ["STK", "KSQ"] as const) {
      const caps = parseSectorCaps(await krxClient.query("MDCSTAT01501", { trdDd: date.replaceAll("-", ""), mktId: market }), market);
      const universe = market === "STK" ? "kospi200" : "kosdaq150";
      const rows = sectors.snapshots[universe][date].rows;
      Object.assign(day, caps);
      if (Object.keys(matchingCaps(rows, caps)).length < Math.floor(rows.length * 0.9)) throw new Error(`${date} ${market} KRX 종가 대조 실패`);
    }
    collected[date] = day;
    console.log(`${date} KRX 시총 확인`);
  }
  const publication: Publication = { version: 2, exchange: "KRX", priceBasis: "KRX_REGULAR_CLOSE", priceTime: "15:30 KST", fetchedAt: new Date().toISOString(), dates: collected };
  await atomicJson(sectorCapsPath, publication);
}
