import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";

export type MinerviniBar = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type MinerviniStock = { code: string; name: string; marketCap: number; tradable: boolean };
export type MinerviniStatus = "excluded" | "trend" | "rs" | "watch" | "ready" | "breakout" | "extended";
export type MinerviniRow = MinerviniStock & {
  date: string | null; price: number | null; rs: number | null; score: number | null;
  status: MinerviniStatus; reasons: string[]; checks: { label: string; pass: boolean }[];
  ma20: number | null; ma50: number | null; ma150: number | null; ma200: number | null;
  longUptrend: boolean; aboveLow: number | null; belowHigh: number | null;
  turnover: number | null; pivot: number | null; pivotGap: number | null;
  contractions: number[]; rangeRatio: number | null; dryUp: number | null;
  volumeRatio: number | null; vcp: boolean; stop: number | null; pivotRisk: number | null; risk: number | null; target: number | null;
};

export const MINERVINI = { minCap: 100_000_000_000, minTurnover: 1_000_000_000, rs: 70, breakoutVolume: 1.5, maxExtension: 5 };
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const pct = (a: number, b: number) => (a / b - 1) * 100;
function sma(bars: MinerviniBar[], days: number, end = bars.length) {
  return end >= days ? mean(bars.slice(end - days, end).map(b => b.close)) : null;
}
function rising200(bars: MinerviniBar[], days: number) {
  if (bars.length < 200 + days) return false;
  for (let end = bars.length - days + 1; end <= bars.length; end++) {
    if (sma(bars, 200, end)! <= sma(bars, 200, end - 1)!) return false;
  }
  return true;
}
export function rsScore(bars: MinerviniBar[]): number | null {
  if (bars.length < 253) return null;
  const last = bars.at(-1)!.close;
  return [63, 126, 189, 252].reduce((sum, days, i) => sum + pct(last, bars[bars.length - 1 - days].close) * (i === 0 ? 0.4 : 0.2), 0);
}

/** Equal scores receive the same midrank. Rank against all members with 253 sessions, before liquidity/trend filters. */
export function rsRanks(scores: { code: string; score: number }[]): Map<string, number> {
  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const ranks = new Map<string, number>();
  for (let i = 0; i < sorted.length;) {
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1].score === sorted[i].score) end++;
    const rank = sorted.length === 1 ? 50 : ((i + end) / 2) / (sorted.length - 1) * 100;
    for (let j = i; j <= end; j++) ranks.set(sorted[j].code, rank);
    i = end + 1;
  }
  return ranks;
}

export function analyzeMinervini(stock: MinerviniStock, bars: MinerviniBar[], rs: number | null, universe: MinerviniUniverse = "kospi200"): MinerviniRow {
  const last = bars.at(-1);
  const row: MinerviniRow = {
    ...stock, date: last?.date ?? null, price: last?.close ?? null, rs, score: rsScore(bars),
    status: "excluded", reasons: [], checks: [], ma20: sma(bars, 20), ma50: sma(bars, 50),
    ma150: sma(bars, 150), ma200: sma(bars, 200), longUptrend: rising200(bars, 105),
    aboveLow: null, belowHigh: null, turnover: null, pivot: null, pivotGap: null,
    contractions: [], rangeRatio: null, dryUp: null, volumeRatio: null, vcp: false, stop: null, pivotRisk: null, risk: null, target: null,
  };
  if (bars.length < 253) row.reasons.push(`일봉 부족 (${bars.length}/253거래일)`);
  if (!stock.tradable) row.reasons.push("거래 상태 미확인·거래 제한");
  if (!stock.code.endsWith("0") || /(?:우(?:B|C)?|우선주)$/.test(stock.name)) row.reasons.push("우선주 제외");
  if (stock.marketCap < MINERVINI.minCap) row.reasons.push("시가총액 1,000억원 미만");
  if (bars.length >= 20) row.turnover = mean(bars.slice(-20).map(b => b.close * b.volume));
  if (row.turnover == null || row.turnover < MINERVINI.minTurnover) row.reasons.push("20일 평균 거래대금(종가×거래량 근사) 10억원 미만");
  if (!last || last.volume <= 0) row.reasons.push("거래정지·당일 거래량 없음");
  if (!last || bars.length < 253) return row;
  const year = bars.slice(-252);
  const low = Math.min(...year.map(b => b.low));
  const high = Math.max(...year.map(b => b.high));
  row.aboveLow = pct(last.close, low);
  row.belowHigh = pct(last.close, high);
  row.checks = [
    { label: "종가 > 150·200일선", pass: last.close > row.ma150! && last.close > row.ma200! },
    { label: "150일선 > 200일선", pass: row.ma150! > row.ma200! },
    { label: "200일선 21거래일 연속 상승", pass: rising200(bars, 21) },
    { label: "50일선 > 150일선 > 200일선", pass: row.ma50! > row.ma150! && row.ma150! > row.ma200! },
    { label: "종가 > 50일선", pass: last.close > row.ma50! },
    { label: "52주 저점 대비 +30% 이상", pass: row.aboveLow >= 30 },
    { label: "52주 고점 대비 -25% 이내", pass: row.belowHigh >= -25 },
    { label: `${minerviniUniverses[universe].name} 내 RS ≥ 70`, pass: rs != null && rs >= MINERVINI.rs },
  ];
  // Today is deliberately excluded from pivot, base, dry-up and volume baseline.
  // Otherwise a breakout bar would raise its own pivot and erase the dry-up setup.
  const prior = bars.slice(0, -1);
  const base = prior.slice(-30);
  const range = (window: MinerviniBar[]) => pct(Math.max(...window.map(b => b.high)), Math.min(...window.map(b => b.low)));
  row.contractions = [base.slice(0, 10), base.slice(10, 20), base.slice(20)].map(range);
  const intraday = (window: MinerviniBar[]) => mean(window.map(b => (b.high - b.low) / b.close));
  const previousRange = intraday(prior.slice(-20, -10));
  row.rangeRatio = previousRange > 0 ? intraday(prior.slice(-10)) / previousRange : null;
  const volume50 = mean(prior.slice(-50).map(b => b.volume));
  row.dryUp = volume50 > 0 ? mean(prior.slice(-10).map(b => b.volume)) / volume50 : null;
  row.volumeRatio = volume50 > 0 ? last.volume / volume50 : null;
  row.pivot = Math.max(...prior.slice(-20).map(b => b.high));
  row.pivotGap = pct(last.close, row.pivot);
  const [a, b, c] = row.contractions;
  row.vcp = a > b && b > c && c <= 10 && row.rangeRatio != null && row.rangeRatio < 1 && row.dryUp != null && row.dryUp < 1;
  row.stop = Math.max(row.pivot * 0.92, Math.min(...prior.slice(-10).map(b => b.low)) * 0.995);
  row.pivotRisk = (1 - row.stop / row.pivot) * 100;
  if (row.stop < last.close) {
    row.risk = (1 - row.stop / last.close) * 100;
    row.target = last.close + 2 * (last.close - row.stop);
  }
  if (row.reasons.length) return row;
  if (row.checks.slice(0, 7).some(c => !c.pass)) row.status = "trend";
  else if (!row.checks[7].pass) row.status = "rs";
  else if (row.pivotGap > MINERVINI.maxExtension) row.status = "extended";
  else if (row.vcp && last.close > row.pivot && prior.at(-1)!.close <= row.pivot && row.volumeRatio != null && row.volumeRatio >= MINERVINI.breakoutVolume) row.status = "breakout";
  else if (row.vcp && row.pivotGap >= -5 && row.pivotGap <= MINERVINI.maxExtension) row.status = "ready";
  else row.status = "watch";
  return row;
}

export function screenMinervini(inputs: { stock: MinerviniStock; bars: MinerviniBar[] }[], universe: MinerviniUniverse = "kospi200") {
  const scores = inputs.flatMap(({ stock, bars }) => {
    const score = rsScore(bars);
    return score == null ? [] : [{ code: stock.code, score }];
  });
  const ranks = rsRanks(scores);
  return inputs.map(({ stock, bars }) => analyzeMinervini(stock, bars, ranks.get(stock.code) ?? null, universe))
    .sort((a, b) => (b.rs ?? -1) - (a.rs ?? -1));
}
