import { adrPremiumSeries } from "@/lib/market/adr-premium";
import { fetchYahooHistory } from "@/lib/sources/yahoo";

export const dynamic = "force-dynamic";

const SHARES_PER_RECEIPT = 0.1;

export async function GET() {
  const [common, adr, fx] = await Promise.all([
    fetchYahooHistory("000660.KS", "5y"),
    fetchYahooHistory("SKHY", "5y"),
    fetchYahooHistory("KRW=X", "5y"),
  ]);
  const failed = [common, adr, fx].find((result) => result.status !== "ok");
  if (failed || common.status !== "ok" || adr.status !== "ok" || fx.status !== "ok") {
    return Response.json({ error: failed?.message ?? "괴리율 시계열을 만들지 못했습니다." }, { status: 502 });
  }
  const points = adrPremiumSeries({
    common: common.data,
    adr: adr.data,
    usdkrw: fx.data,
    sharesPerReceipt: SHARES_PER_RECEIPT,
  });
  return Response.json({
    sharesPerReceipt: SHARES_PER_RECEIPT,
    points: points.map((point) => ({
      date: point.date,
      value: point.premium,
      commonKrw: point.commonKrw,
      adrPerShareKrw: point.adrPerShareKrw,
    })),
  });
}
