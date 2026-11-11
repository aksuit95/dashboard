import { EtfHoldingsBoard } from "@/components/EtfHoldingsBoard";
import { readEtfPublication } from "@/lib/etf/publication";
import { minerviniSession } from "@/lib/market/minervini-session";
import { comparisonDate, selectComparison, type Period } from "@/lib/etf/holdings";
export const dynamic = "force-dynamic";
export default async function EtfHoldingsPage() {
  const publication = await readEtfPublication();
  let expected: string | null = null;
  try { expected = minerviniSession(); } catch { /* calendar not verified */ }
  const selected = expected ? selectComparison(publication, expected) : { latest: null, previous: null, stale: false };
  const periods: Record<Period, { date: string | null; snapshot: typeof selected.latest }> = {
    "1d": {date: null, snapshot: null}, "1w": {date: null, snapshot: null}, "1m": {date: null, snapshot: null},
  };
  if (selected.latest) for (const period of ["1d", "1w", "1m"] as const) {
    try { const date = comparisonDate(selected.latest.asOf, period); periods[period] = { date, snapshot: publication.snapshots.find(s => s.asOf === date) ?? null }; } catch { /* unverified calendar */ }
  }
  return <EtfHoldingsBoard latest={selected.latest} stale={selected.stale} periods={periods} expected={expected} lastAttempt={publication.lastAttempt} />;
}
