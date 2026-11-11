import fs from "node:fs/promises";
import path from "node:path";
import { krxClient } from "@/lib/sources/krx-client";
import { fetchValuationMarketCaps, readMarketCaps } from "@/lib/valuation/market-caps";
import { comparisonDate, emptyPublication, parseKrxHoldings, type Publication, type Snapshot } from "@/lib/etf/holdings";
import { semiconductorEtfs } from "@/lib/etf/config";
import { parseKrxFundMetrics } from "@/lib/etf/fund-metrics";
import { minerviniSession } from "@/lib/market/minervini-session";
export const publicationPath = path.join(process.cwd(), "data", "etf", "holdings.json");
export async function readEtfPublication(): Promise<Publication> {
  try { const p = JSON.parse(await fs.readFile(publicationPath, "utf8")) as Publication; if (![1, 2].includes(p.version) || !Array.isArray(p.snapshots)) throw new Error("ETF 저장 자료 형식 오류"); return p; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(emptyPublication); throw e; }
}
async function save(p: Publication) { await fs.mkdir(path.dirname(publicationPath), { recursive: true }); const tmp = `${publicationPath}.${process.pid}.tmp`; try { await fs.writeFile(tmp, JSON.stringify(p, null, 2) + "\n"); await fs.rename(tmp, publicationPath); } finally { await fs.unlink(tmp).catch(() => undefined); } }
export async function collectEtf(now = new Date()) {
  const expected = minerviniSession(now), p = await readEtfPublication(), errors: string[] = [];
  // Existing v1 snapshots were exclusively TIGER 396500.
  for (const snapshot of p.snapshots) snapshot.etfCode ??= "396500";
  p.version = 2;
  const dates = [expected];
  for (const period of ["1d", "1w", "1m", "3m", "6m"] as const) try { dates.push(comparisonDate(expected, period)); } catch { errors.push(`${period} 거래일 확인 실패`); }
  for (const etf of semiconductorEtfs) for (const day of new Set(dates)) {
    const existing = p.snapshots.find(s => s.etfCode === etf.code && s.asOf === day);
    if (existing && !(day === expected && process.env.ETF_VERIFY_SOURCE === "1")) continue;
    try {
      const payload = await krxClient.query("MDCSTAT05001", { isuCd: etf.isin, trdDd: day.replaceAll("-", "") });
      const holdings = parseKrxHoldings(payload);
      if (existing) { existing.holdings = holdings; existing.collectedAt = new Date().toISOString(); }
      else p.snapshots.push({ etfCode: etf.code, asOf: day, collectedAt: new Date().toISOString(), source: "KRX_PDF", holdings, market: {} });
      console.log(`KRX ETF 구성 조회 성공: ${etf.code} ${day}, ${holdings.length}종목`);
      await save(p);
    } catch (e) { errors.push(`${etf.code} ${day}: ${e instanceof Error ? e.message : "구성 수집 실패"}`); }
  }
  // KRX ETF daily series carries exact trading dates. Collect each ETF once over
  // the needed range and never fill a missing day from a neighbouring session.
  for (const etf of semiconductorEtfs) {
    const targets = p.snapshots.filter(s => s.etfCode === etf.code && dates.includes(s.asOf) && (!s.fundMetrics || s.fundMetrics.asOf !== s.asOf || s.fundMetrics.sharesOutstanding == null || s.fundMetrics.netAssetsKrw == null));
    if (!targets.length) continue;
    try {
      const first = targets.map(s => s.asOf).sort()[0];
      const data = await krxClient.query("MDCSTAT04501", { isuCd: etf.isin, strtDd: first.replaceAll("-", ""), endDd: expected.replaceAll("-", "") });
      const metrics = parseKrxFundMetrics(data, new Date().toISOString());
      for (const snapshot of targets) {
        const row = metrics.get(snapshot.asOf);
        if (!row) { errors.push(`${etf.code} ${snapshot.asOf} ETF 좌수·순자산 자료 없음`); continue; }
        // Never replace a previously verified value with a missing field.
        const previous = snapshot.fundMetrics?.asOf === snapshot.asOf ? snapshot.fundMetrics : null;
        snapshot.fundMetrics = { ...row, sharesOutstanding: row.sharesOutstanding ?? previous?.sharesOutstanding ?? null, netAssetsKrw: row.netAssetsKrw ?? previous?.netAssetsKrw ?? null };
      }
      console.log(`KRX ETF 좌수·순자산 조회: ${etf.code}, ${targets.length}개 기준일`);
      await save(p);
    } catch (e) { errors.push(`${etf.code} ETF 좌수·순자산: ${e instanceof Error ? e.message : "수집 실패"}`); }
  }
  const latest = p.snapshots.filter(s => s.asOf === expected && semiconductorEtfs.some(e => e.code === s.etfCode));
  if (latest.some(s => s.holdings.some(r => !s.market[r.code]))) {
    try {
      let caps = await readMarketCaps().catch(() => null);
      if (!caps || caps.asOf !== expected) caps = await fetchValuationMarketCaps(expected);
      for (const snapshot of latest) {
        const market: Snapshot["market"] = {};
        for (const row of snapshot.holdings) { const close = caps.closes[row.code], cap = caps.values[row.code]; if (close && cap) market[row.code] = { close, cap }; }
        snapshot.market = market;
      }
    } catch (e) { errors.push(`${expected} 시총: ${e instanceof Error ? e.message : "수집 실패"}`); }
  }
  p.snapshots.sort((a,b) => a.asOf.localeCompare(b.asOf) || (a.etfCode ?? "").localeCompare(b.etfCode ?? ""));
  p.lastAttempt = { at: now.toISOString(), expected, error: errors.length ? errors.join("; ") : null }; await save(p);
  if (errors.length) throw new Error(errors.join("; "));
  return p;
}

