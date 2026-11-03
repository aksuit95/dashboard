import { unstable_cache } from "next/cache";
import { adrPremiumSeries, latestAdrPremium } from "@/lib/market/adr-premium";
import { closeDate, usRefreshDate } from "@/lib/market/daily-close";
import { preferredDiscountSeries } from "@/lib/market/preferred-discount";
import { fetchYahooHistory } from "@/lib/sources/yahoo";

// Reuse US history at the Korean close instead of fetching it a second time.
const closedHistory = unstable_cache(async (symbol: string, date: string) => {
  const result = await fetchYahooHistory(symbol, "5y");
  if (result.status !== "ok") throw new Error(result.message);
  return result.data.filter(bar => bar.date <= date);
}, ["proxy-closed-history-v1"], { revalidate: false });

// Separate cutoffs prevent an in-progress US daily candle from becoming a close.
const snapshot = unstable_cache(async (date: string, usDate: string) => {
  const histories = await Promise.all(["005930.KS", "005935.KS", "000660.KS", "SKHY", "KRW=X"]
    .map((symbol, index) => closedHistory(symbol, index < 3 ? date : usDate)));
  const [common, preferred, hynix, adr, usdkrw] = histories;
  const samsung = preferredDiscountSeries(common, preferred);
  const sk = adrPremiumSeries({ common: hynix, adr, usdkrw, sharesPerReceipt: 0.1, atLatestClose: true });
  const latest = latestAdrPremium({ common: hynix, adr, usdkrw, sharesPerReceipt: 0.1 });
  if (latest) {
    const index = sk.findIndex(point => point.date === latest.date);
    if (index >= 0) sk[index] = latest;
    else sk.push(latest);
  }
  if (!samsung.length || !sk.length) throw new Error("괴리율 종가 데이터가 없습니다.");
  return {
    closeDate: samsung.at(-1)!.date,
    samsung,
    adr: sk.map(point => ({ ...point, value: point.premium })),
  };
}, ["proxy-daily-close-v3"], { revalidate: false });

let pending: { date: string; promise: ReturnType<typeof snapshot> } | undefined;

export function loadProxyDailyClose(now = new Date()) {
  const date = closeDate(now);
  const usDate = usRefreshDate(now);
  const key = `${date}/${usDate}`;
  if (pending?.date === key) return pending.promise;
  const promise = snapshot(date, usDate).finally(() => {
    if (pending?.promise === promise) pending = undefined;
  });
  pending = { date: key, promise };
  return promise;
}
