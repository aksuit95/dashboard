import fs from "node:fs/promises";
import path from "node:path";
import { createInvestorKrxWebQuery } from "@/lib/sources/investor-flow-krx-web";
import { krxClient } from "@/lib/sources/krx-client";
import { fetchKrxDailyCloses } from "@/lib/sources/krx-daily-prices";
import { dangerRules, priceThreshold, priceWindowLength, warningRules, type TradedClose } from "./scenarios";

export type PriceDay = { date: string; closes: Record<string, TradedClose> };
export type RiskPriceHistory = {
  version: 1; exchange: "KRX"; priceTime: "15:30 KST" | "16:30 KST"; priceBasis: "KRX_REGULAR_CLOSE";
  fetchedAt: string; days: PriceDay[];
  verifiedCandidates: string[];
  latestMarket: Record<string, { name: string; market: "KOSPI" | "KOSDAQ"; cap: number | null }>;
};
export const riskPricePath = path.join(process.cwd(), "data", "investment-risk", "closes.json");

export async function readRiskPrices(): Promise<RiskPriceHistory | null> {
  try {
    const p = JSON.parse(await fs.readFile(riskPricePath, "utf8")) as RiskPriceHistory;
    if (p.version !== 1 || p.exchange !== "KRX" || p.priceTime !== (p.days?.at(-1)?.date === "2026-11-19" ? "16:30 KST" : "15:30 KST") || p.priceBasis !== "KRX_REGULAR_CLOSE" ||
        !Number.isFinite(Date.parse(p.fetchedAt)) || !Array.isArray(p.days) || p.days.length !== priceWindowLength ||
        p.days.some((d, i) => !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || (i > 0 && p.days[i - 1].date >= d.date) || !d.closes)) {
      throw new Error("KRX 급등 비교 자료 검증 실패");
    }
    return p;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const positiveInt = (value: unknown) => {
  const n = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function collectRiskPrices(asOf: string, previous: RiskPriceHistory | null): Promise<RiskPriceHistory> {
  const sessions = await fetchKrxDailyCloses("005930", asOf, fetch, priceWindowLength);
  if (sessions.length !== priceWindowLength || sessions.some(session => session.close == null)) throw new Error("KRX 거래일 이력 부족");
  // During the evening session the display-price column can differ from the regular
  // close. Use the KRX capitalization per listed share only to shortlist rows.
  // Cross-check the market leaders and each shortlisted stock using the explicit
  // regularMarketClosingPrice before any threshold can be published.
  const query = createInvestorKrxWebQuery(async (bld, params) => {
    const payload = await krxClient.query(bld, params);
    if (!Array.isArray(payload.OutBlock_1)) return payload;
    const rows = payload.OutBlock_1 as Record<string, unknown>[];
    return { ...payload, OutBlock_1: rows.map(row => {
      const cap = positiveInt(row.MKTCAP), shares = positiveInt(row.LIST_SHRS);
      return { ...row, TDD_CLSPRC: cap && shares && cap % shares === 0 ? cap / shares : null };
    }) };
  },
    (code, through) => fetchKrxDailyCloses(code, through, fetch, 1), { allowInvalidRows: true });
  const days: PriceDay[] = [];
  const latestMarket: RiskPriceHistory["latestMarket"] = {};
  for (const { date } of sessions) {
    const saved = previous?.days.find(day => day.date === date);
    if (saved && date !== asOf) { days.push(saved); continue; }
    const closes: PriceDay["closes"] = {};
    for (const market of ["STK", "KSQ"]) {
      const payload = await query("MDCSTAT01501", { trdDd: date.replaceAll("-", ""), mktId: market });
      for (const row of payload.OutBlock_1 as Record<string, unknown>[]) {
        const close = positiveInt(row.TDD_CLSPRC), shares = positiveInt(row.LIST_SHRS);
        const cap = positiveInt(row.MKTCAP), volume = positiveInt(row.ACC_TRDVOL);
        const code = String(row.ISU_SRT_CD);
        const verified = close != null && shares != null && close * shares === cap;
        if (verified && volume) closes[code] = [close, shares];
        if (date === asOf) {
          const name = typeof row.ISU_ABBRV === "string" ? row.ISU_ABBRV.trim() : "";
          if (!name || !/^[0-9A-Z]{6}$/.test(code) || Object.hasOwn(latestMarket, code)) throw new Error("KRX 급등 자료 종목 목록 검증 실패");
          latestMarket[code] = { name, market: market === "STK" ? "KOSPI" : "KOSDAQ", cap: verified ? cap : null };
        }
      }
    }
    days.push({ date, closes });
  }
  const dates = days.map(day => day.date);
  const shortlist = Object.keys(latestMarket).filter(code => {
    const closes = days.map(day => day.closes[code]);
    return [...warningRules, ...dangerRules].some(rule => (priceThreshold(dates, closes, rule)?.gapPct ?? Infinity) <= 30);
  });
  const verifiedCandidates: string[] = [];
  for (let i = 0; i < shortlist.length; i += 4) {
    const batch = await Promise.all(shortlist.slice(i, i + 4).map(async code => {
      try {
        const closes = await fetchKrxDailyCloses(code, asOf, fetch, priceWindowLength);
        return closes.length === days.length && closes.every((bar, index) =>
          bar.date === days[index].date && bar.close === days[index].closes[code]?.[0]) ? code : null;
      } catch {
        return null;
      }
    }));
    verifiedCandidates.push(...batch.filter(code => code !== null));
  }
  if (shortlist.length && !verifiedCandidates.length) throw new Error("급등 후보의 KRX 정규장 종가 교차검증 실패");
  return { version: 1, exchange: "KRX", priceTime: asOf === "2026-11-19" ? "16:30 KST" : "15:30 KST", priceBasis: "KRX_REGULAR_CLOSE", fetchedAt: new Date().toISOString(), days, latestMarket, verifiedCandidates };
}
