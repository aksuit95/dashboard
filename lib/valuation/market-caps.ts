import { requestKrxOpenApi } from "@/lib/sources/krx-openapi";

export type ValuationMarketCaps = {
  asOf: string; fetchedAt: string; exchange: "KRX"; priceTime: "15:30 KST";
  priceBasis: "KRX_REGULAR_CLOSE"; values: Record<string, number | null>;
};

export async function fetchValuationMarketCaps(asOf: string, request = requestKrxOpenApi): Promise<ValuationMarketCaps> {
  const date = asOf.replaceAll("-", "");
  const rows = await request("sto/stk_bydd_trd", date);
  const values: ValuationMarketCaps["values"] = {};
  for (const row of rows) {
    const code = String(row.ISU_CD ?? "");
    if (row.BAS_DD !== date || !/^[0-9A-Z]{6}$/.test(code) || Object.hasOwn(values, code)) throw new Error("KRX 시총 기준일·종목 오류");
    const number = (value: unknown) => typeof value === "string" || typeof value === "number" ? Number(String(value).replaceAll(",", "")) : NaN;
    const cap = number(row.MKTCAP), close = number(row.TDD_CLSPRC);
    values[code] = Number.isFinite(cap) && cap > 0 && Number.isFinite(close) && close > 0 ? cap : null;
  }
  if (!Object.values(values).some(value => value != null)) throw new Error("KRX 시총 결측");
  return { asOf, fetchedAt: new Date().toISOString(), exchange: "KRX", priceTime: "15:30 KST", priceBasis: "KRX_REGULAR_CLOSE", values };
}
