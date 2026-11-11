import fs from 'node:fs/promises';
import path from 'node:path';
import { minerviniSession } from '@/lib/market/minervini-session';
import { parseAnnualEstimate, type AnnualHistory, type AnnualPoint } from '@/lib/valuation/annual-estimates';
import stocks from '@/data/valuation/stocks.json';
import sectors from '@/data/sectors/board.json';

async function main() {
  const now = new Date(), date = minerviniSession(now);
  const kst = new Date(now.getTime() + 9 * 3600_000);
  if (date !== kst.toISOString().slice(0, 10) || kst.getUTCHours() < 16) { console.log('완료된 오늘 거래일이 없어 수집을 건너뜁니다.'); return; }
  const snap = sectors.snapshots.kospi200[date as keyof typeof sectors.snapshots.kospi200];
  if (!snap || snap.asOf !== date || snap.priceBasis !== 'KRX_REGULAR_CLOSE') throw new Error('오늘 검증된 KRX 섹터 종가가 없습니다.');
  const prices = new Map(snap.rows.map(row => [row.code, row.price]));
  const output = path.resolve('data/valuation/annual-estimates.json');
  let history: AnnualHistory = {schemaVersion: 1, source: 'Naver Finance annual consensus', priceBasis: 'KRX_REGULAR_CLOSE', records: {}};
  try { history = JSON.parse(await fs.readFile(output, 'utf8')) as AnnualHistory; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  if (history.schemaVersion !== 1 || history.priceBasis !== 'KRX_REGULAR_CLOSE' || !history.records) throw new Error('예상연도 이력 형식 오류');
  const codes = stocks.data.stocks.map(s => s.code);
  let cursor = 0, failures = 0, successes = 0;
  const result = new Map<string, AnnualPoint>();
  async function worker() {
    while (cursor < codes.length) {
      const code = codes[cursor++];
      try {
        const response = await fetch(`https://m.stock.naver.com/api/stock/${code}/finance/annual`, {headers:{'user-agent':'Mozilla/5.0'}, signal:AbortSignal.timeout(20000)});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const estimate = parseAnnualEstimate(await response.json(), code, date);
        const close = prices.get(code);
        result.set(code, {date, observedAt: new Date().toISOString(), ...estimate, close: typeof close === 'number' && close > 0 ? close : null}); successes++;
      } catch { failures++; }
    }
  }
  await Promise.all(Array.from({length: 4}, () => worker()));
  if (successes < codes.length * .8) throw new Error(`예상 재무 수집 실패 과다: ${successes}/${codes.length}`);
  for (const code of codes) {
    const point = result.get(code) ?? {date, observedAt: now.toISOString(), fiscalPeriod:null, eps:null, bps:null, close:null};
    history.records[code] = [...(history.records[code] ?? []).filter(p => p.date !== date), point].sort((a,b) => a.date.localeCompare(b.date));
  }
  await fs.mkdir(path.dirname(output), {recursive:true});
  const tmp = `${output}.${process.pid}.tmp`;
  try { await fs.writeFile(tmp, JSON.stringify(history), {flag:'wx'}); await fs.rename(tmp, output); } finally { await fs.unlink(tmp).catch(()=>{}); }
  console.log(JSON.stringify({date,successes,failures,withEps:[...result.values()].filter(x=>x.eps !== null).length,withBps:[...result.values()].filter(x=>x.bps !== null).length}));
}
main().catch(e => {console.error(e);process.exitCode=1});
