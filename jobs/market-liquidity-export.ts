import fs from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "@/lib/env";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import { collectMarketFunds, collectMarginLoans, collectFundBalance, collectFundFlows, dateBefore,
  kofiaPublishedAmountUnit, preserveFinerKofiaAmounts, type Dated } from "@/lib/sources/market-liquidity-kofia";
import { collectCashIndex, collectDerivativeTotals, collectForeignFutures, collectPutCallSeries, collectVolatilityIndex } from "@/lib/sources/market-liquidity-krx";
import { liquidityPublicationPath, readLiquidityPublication, validateLiquidityPublication, type LiquidityPublication, type PublishedSeries } from "@/lib/sources/market-liquidity-publication";

loadEnv();

async function main() {
  const now = new Date();
  const koreaDay = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const cashSession = reviewedCloseSession(now, 0), derivativeSession = reviewedCloseSession(now, 160);
  const previous = await readLiquidityPublication();

  async function refresh<T extends Dated>(name: string, collect: () => Promise<T[]>, saved?: PublishedSeries<T>): Promise<PublishedSeries<T>> {
    let failure: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = await collect();
        const latest = value.at(-1)?.date;
        if (!latest || (saved && latest < saved.value.at(-1)!.date)) throw new Error("최신 기준일 미확인");
        console.log(`${name}: ${latest} · ${value.length}건`);
        return saved && JSON.stringify(value) === JSON.stringify(saved.value) ? saved : { value, collectedAt: new Date().toISOString() };
      } catch (error) { failure = error; }
    }
    const reason = failure instanceof Error ? failure.message : "응답 오류";
    if (!saved) throw new Error(`${name} 초기 수집 실패 · ${reason}`);
    console.error(`${name} 갱신 실패 · ${reason} · 저장된 기준일 ${saved.value.at(-1)?.date} 유지`);
    process.exitCode = 1;
    return saved;
  }

  const fundFrom = dateBefore(koreaDay, 400), balanceFrom = dateBefore(koreaDay, 100);
  const cashFrom = dateBefore(cashSession, 400), derivativeFrom = dateBefore(derivativeSession, 95);
  const amountUnit = kofiaPublishedAmountUnit;
  function refreshKofia<T extends Dated>(name: string, collect: () => Promise<T[]>, saved?: PublishedSeries<T>) {
    return refresh(name, async () => preserveFinerKofiaAmounts(await collect(), saved?.value ?? []), saved);
  }
  const kofia = Promise.all([
    refreshKofia("투자자예탁금", () => collectMarketFunds(fundFrom, koreaDay, amountUnit), previous?.balance),
    refreshKofia("신용융자", () => collectMarginLoans(fundFrom, koreaDay, amountUnit), previous?.loans),
    refreshKofia("주식형 순설정액", () => collectFundFlows(fundFrom, koreaDay, true, amountUnit), previous?.including),
    refreshKofia("주식형 순설정액 ETF 제외", () => collectFundFlows(fundFrom, koreaDay, false, amountUnit), previous?.excluding),
    refreshKofia("주식형 설정원본", () => collectFundBalance(balanceFrom, koreaDay, "principal", amountUnit), previous?.principal),
    refreshKofia("주식형 순자산", () => collectFundBalance(balanceFrom, koreaDay, "nav", amountUnit), previous?.nav),
  ]);
  const krx = Promise.all([
    refresh("코스피", () => collectCashIndex("KOSPI", cashFrom, cashSession), previous?.KOSPI),
    refresh("코스닥", () => collectCashIndex("KOSDAQ", cashFrom, cashSession), previous?.KOSDAQ),
    refresh("선물 미결제약정", () => collectDerivativeTotals(derivativeFrom, derivativeSession), previous?.totals),
    refresh("선물 외국인 순매수", () => collectForeignFutures(derivativeFrom, derivativeSession), previous?.foreign),
    refresh("변동성지수", () => collectVolatilityIndex(dateBefore(derivativeSession, 400), derivativeSession), previous?.volatility),
  ]);
  const [[balance, loans, including, excluding, principal, nav], [KOSPI, KOSDAQ, totals, foreign, volatility]] = await Promise.all([kofia, krx]);
  const putCall = await refresh("풋·콜 거래량 비율", async () => {
    const { ratio, ratioMissing } = await collectPutCallSeries(totals.value);
    if (ratioMissing) throw new Error(`거래량 대조 실패 ${ratioMissing}일`);
    return ratio;
  }, previous?.putCall);
  const data: LiquidityPublication = {
    version: 1, priceBasis: "KRX_REGULAR_CLOSE_1530", derivativeSession: "KRX_DAY",
    balance, loans, including, excluding, principal, nav, KOSPI, KOSDAQ, totals, foreign, volatility, putCall,
  };
  validateLiquidityPublication(data);
  const output = JSON.stringify(data) + "\n";
  if (previous && JSON.stringify(previous) === JSON.stringify(data)) return;
  const temporary = `${liquidityPublicationPath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(liquidityPublicationPath), { recursive: true });
  try {
    await fs.writeFile(temporary, output, { flag: "wx" });
    await fs.rename(temporary, liquidityPublicationPath);
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
