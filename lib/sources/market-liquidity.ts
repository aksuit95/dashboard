import { unstable_cache } from "next/cache";
import { reviewedCloseSession } from "@/lib/market/reviewed-close-session";
import type { IndexMarket, Point } from "@/lib/market/market-liquidity";
import { collectMarketFunds, collectMarginLoans, collectFundBalance, collectFundFlows, dateBefore } from "./market-liquidity-kofia";
import { collectCashIndex, collectDerivativeTotals, collectForeignFutures, collectPutCall, collectVolatilityIndex, readPublishedCashIndex } from "./market-liquidity-krx";

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

export async function loadLiquidityFunds(now: Date) {
  const through = kstDay(now), from = dateBefore(through, 400);
  const [balance, loans] = await Promise.all([available(funds(from, through)), available(credit(from, through))]);
  return { balance, loans };
}

export async function loadEquityFunds(now: Date) {
  const through = kstDay(now), from = dateBefore(through, 400), balanceFrom = dateBefore(through, 100);
  const [including, excluding, fundPrincipal, fundNav] = await Promise.all([
    available(inflows(from, through)), available(inflowsExEtf(from, through)),
    available(principal(balanceFrom, through)), available(nav(balanceFrom, through)),
  ]);
  return { including, excluding, fundPrincipal, fundNav };
}

export async function loadLiquidityIndices(now: Date) {
  const through = reviewedCloseSession(now, 0), from = dateBefore(through, 400);
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
  const [totals, foreign, vkospi] = await Promise.all([
    available(derivativeTotals(from, through)), available(foreignFutures(from, through)), available(volatility(dateBefore(through, 400), through)),
  ]);
  const ratio: Point[] = [];
  let ratioMissing = 0;
  const days = totals.value?.slice(-10) ?? [];
  for (let i = 0; i < days.length; i += 2) {
    const observations = await Promise.all(days.slice(i, i + 2).map(day => available(putCall(day.date, String(day.optionVolume)))));
    for (const observation of observations) {
      if (observation.value) ratio.push(observation.value);
      else ratioMissing++;
    }
  }
  return { totals, foreign, vkospi, ratio, ratioMissing, through };
}
