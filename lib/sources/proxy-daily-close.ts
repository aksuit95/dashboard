import { unstable_cache } from "next/cache";
import { adrPremiumSeries } from "@/lib/market/adr-premium";
import { closeDate } from "@/lib/market/daily-close";
import { preferredDiscountSeries } from "@/lib/market/preferred-discount";
import { fetchYahooHistory } from "@/lib/sources/yahoo";

// Both charts share a persistent snapshot per Korean close.
const snapshot = unstable_cache(async (date: string) => {
  const results = await Promise.all(["005930.KS", "005935.KS", "000660.KS", "SKHY", "KRW=X"].map(symbol => fetchYahooHistory(symbol, "5y")));
  const histories = results.map(result => {
    if (result.status !== "ok") throw new Error(result.message);
    return result.data.filter(bar => bar.date <= date);
  });
  const [common, preferred, hynix, adr, usdkrw] = histories;
  const samsung = preferredDiscountSeries(common, preferred);
  const sk = adrPremiumSeries({ common: hynix, adr, usdkrw, sharesPerReceipt: 0.1, atKoreanClose: true });
  const dates = new Set(sk.map(point => point.date));
  const latest = samsung.findLast(point => dates.has(point.date))?.date;
  if (!latest) throw new Error("두 괴리율의 공통 종가 기준일이 없습니다.");
  const through = <T extends { date: string }>(points: T[]) => points.filter(point => point.date <= latest);
  return {
    closeDate: latest,
    samsung: through(samsung),
    adr: through(sk).map(point => ({ ...point, value: point.premium })),
  };
}, ["proxy-daily-close-v1"], { revalidate: false });

let pending: { date: string; promise: ReturnType<typeof snapshot> } | undefined;

export function loadProxyDailyClose(now = new Date()) {
  const date = closeDate(now);
  if (pending?.date === date) return pending.promise;
  const promise = snapshot(date).finally(() => {
    if (pending?.promise === promise) pending = undefined;
  });
  pending = { date, promise };
  return promise;
}
