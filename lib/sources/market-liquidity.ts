import { unstable_cache } from "next/cache";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import type { IndexMarket } from "@/lib/market/market-liquidity";
import { collectMarketFunds, collectMarginLoans, collectFundBalance, collectFundFlows, dateBefore } from "./market-liquidity-kofia";
import { collectCashIndex, collectDerivativeTotals, collectForeignFutures, collectPutCall, collectPutCallSeries, collectVolatilityIndex, readPublishedCashIndex } from "./market-liquidity-krx";
import { readLiquidityPublication, selectPublishedSeries } from "./market-liquidity-publication";

function cached<Args extends string[], Value>(id: string, collect: (...args: Args) => Promise<Value>, revalidate = 1_800) {
  return unstable_cache(async (...args: Args) => ({ value: await collect(...args), collectedAt: new Date().toISOString() }),
    ["market-liquidity-v4", id], { revalidate });
}

async function available<T>(load: Promise<{ value: T; collectedAt: string }>) {
  try { return { ...await load, error: null }; }
  catch (error) { return { value: null, collectedAt: null, error: error instanceof Error ? error.message : "통계 수집 실패" }; }
}

const funds = cached("cash", collectMarketFunds);
const credit = cached("credit", collectMarginLoans);
const inflows = cached("fund-flow", (from, through) => collectFundFlows(from, through, true));
const inflowsExEtf = cached("fund-flow-ex-etf", (from, through) => collectFundFlows(from, through, false));
const principal = cached("fund-principal", (from, through) => collectFundBalance(from, through, "principal"));
const nav = cached("fund-nav", (from, through) => collectFundBalance(from, through, "nav"));
const kospi = cached("kospi", (from, through) => collectCashIndex("KOSPI", from, through));
const kosdaq = cached("kosdaq", (from, through) => collectCashIndex("KOSDAQ", from, through));
const derivativeTotals = cached("derivatives", collectDerivativeTotals);
const foreignFutures = cached("foreign-futures", collectForeignFutures);
const volatility = cached("volatility", collectVolatilityIndex);
const putCall = cached("put-call", (date, volume) => collectPutCall({ date, optionVolume: Number(volume) }), 86_400);

function kstDay(now: Date) {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function usePublication() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export async function loadLiquidityFunds(now: Date) {
  const through = kstDay(now), from = dateBefore(through, 400);
  if (usePublication()) {
    const saved = await readLiquidityPublication();
    return { balance: selectPublishedSeries(saved?.balance, through), loans: selectPublishedSeries(saved?.loans, through) };
  }
  const [balance, loans] = await Promise.all([available(funds(from, through)), available(credit(from, through))]);
  return { balance, loans };
}

export async function loadEquityFunds(now: Date) {
  const through = kstDay(now), from = dateBefore(through, 400), balanceFrom = dateBefore(through, 100);
  if (usePublication()) {
    const saved = await readLiquidityPublication();
    return {
      including: selectPublishedSeries(saved?.including, through), excluding: selectPublishedSeries(saved?.excluding, through),
      fundPrincipal: selectPublishedSeries(saved?.principal, through), fundNav: selectPublishedSeries(saved?.nav, through),
    };
  }
  const [including, excluding, fundPrincipal, fundNav] = await Promise.all([
    available(inflows(from, through)), available(inflowsExEtf(from, through)),
    available(principal(balanceFrom, through)), available(nav(balanceFrom, through)),
  ]);
  return { including, excluding, fundPrincipal, fundNav };
}

export async function loadLiquidityIndices(now: Date) {
  const through = reviewedCloseSession(now, 0), from = dateBefore(through, 400);
  if (usePublication()) {
    const saved = await readLiquidityPublication();
    return { KOSPI: selectPublishedSeries(saved?.KOSPI, through), KOSDAQ: selectPublishedSeries(saved?.KOSDAQ, through), through };
  }
  async function index(market: IndexMarket) {
    const live = await available((market === "KOSPI" ? kospi : kosdaq)(from, through));
    if (live.value) return live;
    try { return { value: await readPublishedCashIndex(market, from, through), collectedAt: null, error: live.error }; }
    catch { return live; }
  }
  const [KOSPI, KOSDAQ] = await Promise.all([index("KOSPI"), index("KOSDAQ")]);
  return { KOSPI, KOSDAQ, through };
}

export async function loadLiquidityDerivatives(now: Date) {
  const through = reviewedCloseSession(now, 160);
  const from = dateBefore(through, 95);
  if (usePublication()) {
    const saved = await readLiquidityPublication();
    const totals = selectPublishedSeries(saved?.totals, through);
    const foreign = selectPublishedSeries(saved?.foreign, through);
    const vkospi = selectPublishedSeries(saved?.volatility, through);
    const dates = new Set(totals.value?.slice(-10).map(point => point.date));
    const ratio = (selectPublishedSeries(saved?.putCall, through).value ?? []).filter(point => dates.has(point.date));
    return { totals, foreign, vkospi, ratio, ratioMissing: dates.size - ratio.length, through };
  }
  const [totals, foreign, vkospi] = await Promise.all([
    available(derivativeTotals(from, through)), available(foreignFutures(from, through)), available(volatility(dateBefore(through, 400), through)),
  ]);
  const { ratio, ratioMissing } = await collectPutCallSeries(totals.value ?? [], async day => (await putCall(day.date, String(day.optionVolume))).value);
  return { totals, foreign, vkospi, ratio, ratioMissing, through };
}
