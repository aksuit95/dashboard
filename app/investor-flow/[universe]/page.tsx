import { notFound } from "next/navigation";
import { isMinerviniUniverse } from "@/config/minervini";
import { InvestorFlowBoard } from "@/components/InvestorFlowBoard";
export default async function Page({ params }: { params: Promise<{ universe: string }> }) {
  const { universe } = await params;
  if (!isMinerviniUniverse(universe)) notFound();
  return <InvestorFlowBoard key={universe} universe={universe} view="index" />;
}
