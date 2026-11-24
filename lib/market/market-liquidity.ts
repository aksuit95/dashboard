export type Point = { date: string; value: number };
export type IndexMarket = "KOSPI" | "KOSDAQ";
export type IndexDay = { date: string; close: number; turnover: number | null; marketCap: number | null };

export function changeOver(points: Point[], sessions: number): number | null {
  const current = points.at(-1), previous = points.at(-sessions - 1);
  return current && previous ? current.value - previous.value : null;
}

export function creditToMarketCap(credit: { date: string; balance: number }[], market: IndexDay[]): Point[] {
  const caps = new Map(market.map(row => [row.date, row.marketCap]));
  return credit.flatMap(({ date, balance }) => {
    const cap = caps.get(date);
    return cap && cap > 0 ? [{ date, value: balance / cap * 100 }] : [];
  });
}

export function indexTurnoverProfile(rows: IndexDay[], tradingDays: number, binCount = 16) {
  const period = rows.slice(-tradingDays);
  const observed = period.filter(row => row.turnover != null);
  const first = period[0], last = period.at(-1);
  if (!first || !last || !observed.length) return null;
  const min = Math.min(...period.map(row => row.close));
  const max = Math.max(...period.map(row => row.close));
  const width = Math.max(1, Math.ceil((max - min) / binCount));
  const bins = Array.from({ length: Math.min(binCount, Math.floor((max - min) / width) + 1) }, (_, index) => ({
    low: min + index * width, high: min + (index + 1) * width, turnover: 0,
  }));
  const binIndex = (close: number) => Math.min(bins.length - 1, Math.floor((close - min) / width));
  for (const row of observed) bins[binIndex(row.close)].turnover += row.turnover!;
  return {
    bins, coveredDays: observed.length, priceDays: period.length, from: first.date, through: last.date,
    lastClose: last.close, currentBin: binIndex(last.close), total: bins.reduce((sum, bin) => sum + bin.turnover, 0),
  };
}
