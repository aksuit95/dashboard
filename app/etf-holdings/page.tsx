import { SemiconductorBoard } from "@/components/SemiconductorBoard";
import { readEtfPublication } from "@/lib/etf/publication";
import { minerviniSession } from "@/lib/market/minervini-session";
export const dynamic = "force-dynamic";
export default async function EtfHoldingsPage() {
  const publication = await readEtfPublication();
  let expected: string | null = null;
  try { expected = minerviniSession(); } catch { /* unverified calendar */ }
  return <SemiconductorBoard publication={publication} expected={expected} />;
}
