export type ShortCoverStock = {
  code: string;
  name: string;
  short_value_ratio_pct_mean_20: number | null;
  cover_price_rise_pct: number | null;
  latest_disclosed_balance: { as_of: string; balance_ratio_pct: number | null } | null;
};

export type ShortCoverSession = { date: string; session_status: string };
export type ShortCoverCandidate<T extends ShortCoverStock> = {
  stock: T;
  score: number;
  balanceAge: number;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Midrank percentiles keep ties equal and make both metrics comparable without
// pretending that the result is a probability or a measured short position.
function percentile(values: number[], value: number): number {
  const below = values.filter(v => v < value).length;
  const ties = values.filter(v => v === value).length;
  return 100 * (below + ties / 2) / values.length;
}

export function rankShortCoverCandidates<T extends ShortCoverStock>(
  stocks: T[], sessions: ShortCoverSession[], asOf: string,
): ShortCoverCandidate<T>[] {
  const days = [...new Set(sessions.filter(row => row.session_status === "trading" && row.date <= asOf).map(row => row.date))].sort();
  if (days.at(-1) !== asOf) return [];
  const ageByDate = new Map(days.map((day, index) => [day, days.length - index - 1]));
  const eligible = stocks.flatMap(stock => {
    const balance = stock.latest_disclosed_balance;
    const age = balance ? ageByDate.get(balance.as_of) : undefined;
    if (!balance || !finite(balance.balance_ratio_pct) || balance.balance_ratio_pct <= 0 ||
        !finite(stock.short_value_ratio_pct_mean_20) || stock.short_value_ratio_pct_mean_20 < 0 ||
        age === undefined || age > 5) return [];
    return [{ stock, balanceAge: age, balance: balance.balance_ratio_pct, flow: stock.short_value_ratio_pct_mean_20 }];
  });
  const balances = eligible.map(item => item.balance);
  const flows = eligible.map(item => item.flow);
  return eligible.map(item => ({
    stock: item.stock,
    balanceAge: item.balanceAge,
    score: 0.7 * percentile(balances, item.balance) + 0.3 * percentile(flows, item.flow),
  })).sort((a, b) => b.score - a.score ||
    b.stock.latest_disclosed_balance!.balance_ratio_pct! - a.stock.latest_disclosed_balance!.balance_ratio_pct! ||
    a.stock.code.localeCompare(b.stock.code));
}
