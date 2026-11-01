import type { TaiwanCompany } from "@/config/taiwan";
import { empty, ok, stale, type SourceResult } from "@/lib/sources/types";

const URL = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L";

export type TaiwanRevenue = {
  symbol: string;
  name: string;
  sector: string;
  period: string;
  revenue: number;
};

function rocMonth(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string" || !/^\d{5}$/.test(value)) return null;
  const year = Number(value.slice(0, 3)) + 1911;
  const month = Number(value.slice(3));
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number): string {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return periodOf(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function revenue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseTaiwanRevenue(payload: unknown, companies: TaiwanCompany[]): TaiwanRevenue[] | null {
  if (!Array.isArray(payload)) return null;
  const byCode = new Map<string, Record<string, unknown>>();
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row["公司代號"] === "string") byCode.set(row["公司代號"], row);
  }
  const points: TaiwanRevenue[] = [];
  for (const company of companies) {
    const row = byCode.get(company.symbol);
    if (!row) continue;
    const month = rocMonth(row["資料年月"]);
    if (!month) continue;
    const fields: [string, string][] = [
      ["營業收入-當月營收", periodOf(month.year, month.month)],
      ["營業收入-上月營收", shiftMonth(month.year, month.month, -1)],
      ["營業收入-去年當月營收", shiftMonth(month.year, month.month, -12)],
    ];
    for (const [field, period] of fields) {
      const value = revenue(row[field]);
      if (value == null) continue;
      points.push({ symbol: company.symbol, name: company.name, sector: company.sector, period, revenue: value });
    }
  }
  return points;
}

export async function fetchTaiwanRevenue(companies: TaiwanCompany[]): Promise<SourceResult<TaiwanRevenue[]>> {
  let response: Response;
  try {
    response = await fetch(URL, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
  } catch (error) {
    return stale(error instanceof Error ? error.message : "대만 월매출 연결에 실패했습니다.");
  }
  if (!response.ok) return stale(`대만 월매출 응답 ${response.status}`);
  const rows = parseTaiwanRevenue(await response.json(), companies);
  if (!rows) return stale("대만 월매출 형식이 예상과 다릅니다.");
  if (!rows.length) return empty("요청한 종목이 상장 월매출에 없습니다.");
  return ok(rows);
}
