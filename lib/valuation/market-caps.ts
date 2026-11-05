import fs from "node:fs/promises";
import path from "node:path";
import { createInvestorKrxWebQuery } from "@/lib/sources/investor-flow-krx-web";
type Row = Record<string, unknown>;
type Query = (bld: string, params: Record<string, string>) => Promise<Row>;
export type ValuationMarketCaps = {
  version: 1; source: "KRX_WEB_VERIFIED"; asOf: string; fetchedAt: string; exchange: "KRX"; priceTime: "15:30 KST";
  priceBasis: "KRX_REGULAR_CLOSE"; values: Record<string, number | null>; closes: Record<string, number | null>;
};
export const marketCapsPath = path.join(process.cwd(), "data", "valuation", "market-caps.json");
export function validateMarketCaps(value: unknown): ValuationMarketCaps {
  const p = value as ValuationMarketCaps;
  if (p?.version !== 1 || p.source !== "KRX_WEB_VERIFIED" || p.exchange !== "KRX" || p.priceTime !== "15:30 KST" || p.priceBasis !== "KRX_REGULAR_CLOSE" || !/^\d{4}-\d{2}-\d{2}$/.test(p.asOf) || !Number.isFinite(Date.parse(p.fetchedAt)) || !p.values || !p.closes || Object.keys(p.values).length < 10 || Object.keys(p.values).length !== Object.keys(p.closes).length) throw new Error("KRX 시총 파일 형식 오류");
  for (const [code, cap] of Object.entries(p.values)) if (!/^[0-9A-Z]{6}$/.test(code) || !Number.isSafeInteger(cap) || cap! <= 0 || !Number.isSafeInteger(p.closes[code]) || p.closes[code]! <= 0) throw new Error("KRX 시총 종목 검증 오류");
  return p;
}
export async function readMarketCaps(file = marketCapsPath): Promise<ValuationMarketCaps | null> {
  try { return validateMarketCaps(JSON.parse(await fs.readFile(file, "utf8"))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function fetchValuationMarketCaps(asOf: string, query: Query = createInvestorKrxWebQuery(), now = new Date()): Promise<ValuationMarketCaps> {
  const values: ValuationMarketCaps["values"] = {}, closes: ValuationMarketCaps["closes"] = {};
  for (const market of ["STK", "KSQ"]) {
    const payload = await query("MDCSTAT01501", { trdDd: asOf.replaceAll("-", ""), mktId: market });
    if (!Array.isArray(payload.OutBlock_1) || payload.OutBlock_1.length < 10) throw new Error("KRX 시장별 시총 누락");
    for (const row of payload.OutBlock_1 as Row[]) {
      const code = String(row.ISU_SRT_CD ?? ""), parse = (v: unknown) => Number(String(v ?? "").replaceAll(",", ""));
      const close = parse(row.TDD_CLSPRC), cap = parse(row.MKTCAP), shares = parse(row.LIST_SHRS);
      if (!/^[0-9A-Z]{6}$/.test(code) || row.MKT_ID !== market || Object.hasOwn(values, code) || ![close, cap, shares].every(Number.isSafeInteger) || close <= 0 || cap <= 0 || shares <= 0 || close * shares !== cap) throw new Error("KRX 시총·종가 검증 오류");
      values[code] = cap; closes[code] = close;
    }
  }
  return validateMarketCaps({ version: 1, source: "KRX_WEB_VERIFIED", asOf, fetchedAt: now.toISOString(), exchange: "KRX", priceTime: "15:30 KST", priceBasis: "KRX_REGULAR_CLOSE", values, closes });
}
