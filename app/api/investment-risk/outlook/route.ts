import { NextResponse } from "next/server";
import { financialPath, readFinancialPublication } from "@/lib/financials/source";
import { financialMarkets, type FinancialMarket } from "@/lib/financials/types";
import { reviewedCloseSession as minerviniSession } from "@/lib/market/reviewed-close-session";
import { readRiskPrices } from "@/lib/investment-risk/history";
import { capitalScenario, dangerRules, priceThreshold, warningRules } from "@/lib/investment-risk/scenarios";
import type { MarketFinancialOutlook, RiskOutlook } from "@/lib/investment-risk/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function priceOutlook(): Promise<RiskOutlook["price"]> {
  const history = await readRiskPrices();
  const latest = history?.days.at(-1);
  if (!history?.latestMarket || !latest || !Array.isArray(history.verifiedCandidates)) return null;
  let expectedAsOf: string | null = null;
  try { expectedAsOf = minerviniSession(); } catch { /* Exceptional trading date not confirmed. */ }
  const dates = history.days.map(day => day.date);
  const cutoff = Object.values(history.latestMarket).flatMap(stock => stock.cap ?? []).sort((a, b) => b - a)[99];
  if (cutoff == null) return null;
  const verified = new Set(history.verifiedCandidates);
  let covered = 0;
  const rows = Object.entries(history.latestMarket).flatMap(([code, stock]) => {
    const close = latest.closes[code]?.[0];
    if (!close) return [];
    const bars = history.days.map(day => day.closes[code]);
    const warning = stock.cap != null && stock.cap < cutoff
      ? warningRules.flatMap(rule => priceThreshold(dates, bars, rule) ?? []) : [];
    const danger = dangerRules.flatMap(rule => priceThreshold(dates, bars, rule) ?? []);
    if (!danger.length) return [];
    covered++;
    if (!verified.has(code)) return [];
    // Keep an ordinary daily-limit-sized screen. This does not model per-stock limits or ticks.
    const withinRange = (rule: { gapPct: number }) => rule.gapPct <= 30;
    if (!warning.some(withinRange) && !danger.some(withinRange)) return [];
    return [{ code, name: stock.name, market: stock.market, close, warning: warning.filter(withinRange), danger: danger.filter(withinRange) }];
  });
  return { asOf: latest.date, expectedAsOf, fetchedAt: history.fetchedAt, covered, total: Object.keys(history.latestMarket).length, rows };
}

async function financialOutlook(market: FinancialMarket): Promise<MarketFinancialOutlook | null> {
  const publication = await readFinancialPublication(financialPath(financialMarkets[market].universe));
  if (!publication) return null;
  let covered = 0;
  const rows = publication.companies.flatMap(company => {
    const scenario = capitalScenario(company, market);
    if (!scenario) return [];
    covered++;
    const capitalWatch = scenario.impairmentPct != null && scenario.impairmentPct >= 25;
    if (scenario.repeatLoss == null && !capitalWatch && !scenario.equityFloor?.currentBelow) return [];
    return [{ code: company.code, name: company.name, market, ...scenario }];
  });
  return { covered, total: publication.companies.length, rows };
}

export async function GET() {
  const [price, kospi, kosdaq] = await Promise.allSettled([priceOutlook(), financialOutlook("KOSPI"), financialOutlook("KOSDAQ")]);
  const result: RiskOutlook = {
    price: price.status === "fulfilled" ? price.value : null,
    financial: {
      KOSPI: kospi.status === "fulfilled" ? kospi.value : null,
      KOSDAQ: kosdaq.status === "fulfilled" ? kosdaq.value : null,
    },
  };
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
