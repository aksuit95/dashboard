import fs from "node:fs/promises";
import { loadEnv } from "@/lib/env";
import { createInvestorKrxWebQuery } from "@/lib/sources/investor-flow-krx-web";
import { readInvestorPublication, investorPublicationPath, validateInvestorPublication } from "@/lib/sources/investor-flow-publication";
import { parseMarketTurnover } from "@/lib/market/market-turnover";
loadEnv();
async function main() {
  const publication = await readInvestorPublication();
  if (!publication) throw new Error("저장된 수급 스냅샷이 없습니다.");
  for (const universe of ["kospi200", "kosdaq150"] as const) {
    const row = publication.snapshots.filter(s => s.universe === universe && s.view === "index" && s.toss).sort((a,b) => b.as_of.localeCompare(a.as_of))[0];
    if (!row?.toss) throw new Error(`${universe} 저장된 시장 수급이 없습니다.`);
    const data = JSON.parse(row.toss) as { points: { date: string }[]; market: string; turnover?: unknown; turnoverError?: string | null; turnoverCollectedAt?: string };
    if (!data.points.length) throw new Error(`${universe} 시장 거래일이 없습니다.`);
    const dates = data.points.map(point => point.date.replaceAll("-", ""));
    const query = createInvestorKrxWebQuery();
    const result = await query("MDCSTAT00301", { indIdx: universe === "kospi200" ? "1" : "2", indIdx2: "001", marketIndex: data.market, strtDd: dates[0], endDd: row.as_of.replaceAll("-", ""), sessionDates: JSON.stringify(dates) });
    data.turnover = parseMarketTurnover(result, row.as_of);
    const found = new Set((data.turnover as { date: string }[]).map(point => point.date));
    if (data.points.some(point => !found.has(point.date))) throw new Error(`${universe} 수급 거래일의 KRX 거래대금 누락`);
    data.turnoverError = null;
    data.turnoverCollectedAt = new Date().toISOString();
    row.toss = JSON.stringify(data);
    console.log(`${universe} ${row.as_of}: ${(data.turnover as unknown[]).length}일`);
  }
  validateInvestorPublication(publication);
  const temporary = `${investorPublicationPath}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(publication) + "\n", { flag: "wx" }); await fs.rename(temporary, investorPublicationPath); }
  finally { await fs.unlink(temporary).catch(() => undefined); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
