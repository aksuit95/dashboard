import { EtfHoldingsBoard } from "@/components/EtfHoldingsBoard";
import caps from "@/data/valuation/market-caps.json";

export default function EtfHoldingsPage() {
  const codes = ["005930", "000660", "402340", "042700", "036930", "007660", "000990", "039030", "058470", "240810"];
  const values = caps.values as Record<string, number | null>;
  const closes = caps.closes as Record<string, number | null>;
  const verified = caps.source === "KRX_WEB_VERIFIED" && caps.priceBasis === "KRX_REGULAR_CLOSE" && caps.exchange === "KRX" && caps.priceTime === "15:30 KST" && caps.asOf === "2026-11-10";
  const market = Object.fromEntries(codes.map(code => [code, { close: verified ? closes[code] ?? null : null, cap: verified ? values[code] ?? null : null }]));
  return <EtfHoldingsBoard market={market} />;
}
