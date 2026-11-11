import fs from "node:fs/promises";
import path from "node:path";
import { krxClient } from "@/lib/sources/krx-client";
import { fetchValuationMarketCaps, readMarketCaps } from "@/lib/valuation/market-caps";
import { comparisonDate, emptyPublication, parseKrxHoldings, type Publication, type Snapshot } from "@/lib/etf/holdings";
import { minerviniSession } from "@/lib/market/minervini-session";

export const publicationPath = path.join(process.cwd(), "data", "etf", "holdings.json");
export async function readEtfPublication(): Promise<Publication> {
  try { const p = JSON.parse(await fs.readFile(publicationPath, "utf8")) as Publication; if (p.version !== 1 || !Array.isArray(p.snapshots)) throw new Error("ETF 저장 자료 형식 오류"); return p; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyPublication; throw e; }
}
async function save(p: Publication) { await fs.mkdir(path.dirname(publicationPath), { recursive: true }); const tmp = `${publicationPath}.${process.pid}.tmp`; try { await fs.writeFile(tmp, JSON.stringify(p, null, 2) + "\n"); await fs.rename(tmp, publicationPath); } finally { await fs.unlink(tmp).catch(() => undefined); } }
export async function collectEtf(now = new Date()) {
  const expected = minerviniSession(now), p = await readEtfPublication(), errors: string[] = [];
  const dates = [expected];
  for (const period of ["1d", "1w", "1m"] as const) {
    try { dates.push(comparisonDate(expected, period)); } catch { errors.push(`${period} 거래일 확인 실패`); }
  }
  for (const day of new Set(dates)) {
    const existing = p.snapshots.find(s => s.asOf === day);
    const verify = day === expected && process.env.ETF_VERIFY_SOURCE === "1";
    if (existing && !verify) continue;
    try {
      const payload = await krxClient.query("MDCSTAT05001", { isuCd: "KR7396500001", trdDd: day.replaceAll("-", "") });
      const holdings = parseKrxHoldings(payload);
      if (existing) { existing.holdings = holdings; existing.collectedAt = new Date().toISOString(); }
      else p.snapshots.push({ asOf: day, collectedAt: new Date().toISOString(), source: "KRX_PDF", holdings, market: {} });
      console.log(`KRX ETF 구성 조회 성공: ${day}, ${holdings.length}종목`);
      p.snapshots.sort((a,b) => a.asOf.localeCompare(b.asOf));
      await save(p);
    } catch (e) { errors.push(`${day}: ${e instanceof Error ? e.message : "구성 수집 실패"}`); }
  }
  const latest = p.snapshots.find(s => s.asOf === expected);
  if (latest && latest.holdings.some(r => !latest.market[r.code])) {
    try {
      let caps = await readMarketCaps().catch(() => null);
      if (!caps || caps.asOf !== expected) caps = await fetchValuationMarketCaps(expected);
      const market: Snapshot["market"] = {};
      for (const row of latest.holdings) { const close = caps.closes[row.code], cap = caps.values[row.code]; if (close && cap) market[row.code] = { close, cap }; }
      latest.market = market;
    } catch (e) { errors.push(`${expected} 시총: ${e instanceof Error ? e.message : "수집 실패"}`); }
  }
  p.lastAttempt = { at: now.toISOString(), expected, error: errors.length ? errors.join("; ") : null }; await save(p);
  if (errors.length) throw new Error(errors.join("; "));
  return p;
}

