import { readHttpsResponse } from "./https-response";

const origin = "https://freesis.kofia.or.kr";
export const kofiaStatisticsUrl = `${origin}/stats/siteMap.do`;
export const kofiaPublishedAmountUnit = 1_000_000;
type AmountUnit = 1 | typeof kofiaPublishedAmountUnit;

export type Dated = { date: string };
type Row = Record<string, unknown>;
export type MarketFunds = Dated & {
  deposits: number;
  derivativesDeposits: number;
  unpaid: number;
  forcedSale: number;
  forcedSalePct: number | null;
};
export type MarginLoan = Dated & { total: number; kospi: number; kosdaq: number };
export type FundFlow = Dated & { subscriptions: number; redemptions: number; net: number };
export type FundBalance = Dated & { value: number };

export function preserveFinerKofiaAmounts<T extends Dated>(rows: T[], saved: T[]): T[] {
  const byDate = new Map(saved.map(row => [row.date, row]));
  return rows.map(row => {
    const previous = byDate.get(row.date);
    if (!previous) return row;
    const sameAtPublishedPrecision = Object.entries(row).every(([field, published]) => {
      const original = previous[field as keyof T];
      if (field === "forcedSalePct" || typeof original !== "number" || typeof published !== "number") return original === published;
      return Math.abs(original - published) <= kofiaPublishedAmountUnit / 2;
    });
    return sameAtPublishedPrecision ? previous : row;
  });
}

export function dateBefore(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - days);
  return day.toISOString().slice(0, 10);
}

function dateOf(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(-2)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null;
}

function numeric(value: unknown): number | null {
  const text = typeof value === "number" || typeof value === "string" ? String(value).trim().replaceAll(",", "") : "";
  const number = Number(text);
  return /^-?\d+(?:\.\d+)?$/.test(text) && Number.isFinite(number) ? number : null;
}

function won(value: unknown, unit: AmountUnit, signed = false): number {
  const number = numeric(value);
  if (number == null || (!signed && number < 0) || !Number.isSafeInteger(number) || !Number.isSafeInteger(number * unit)) {
    throw new Error("금투협 통계 금액 형식 오류");
  }
  return number * unit;
}

function parseRows<T extends Dated>(payload: unknown, from: string, through: string, read: (row: Row, date: string) => T): T[] {
  const rows = (payload as { ds1?: unknown })?.ds1;
  if (!Array.isArray(rows)) throw new Error("금투협 통계 응답 형식 오류");
  const output = new Map<string, T>();
  for (const row of rows) {
    const date = dateOf(row?.TMPV1);
    if (!date || date < from || date > through) continue;
    if (output.has(date)) throw new Error("금투협 통계 기준일 중복");
    output.set(date, read(row, date));
  }
  if (!output.size) throw new Error("조회 구간에 발표된 금투협 통계가 없습니다.");
  return [...output.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function parseMarketFunds(payload: unknown, from: string, through: string, unit: AmountUnit = 1): MarketFunds[] {
  return parseRows(payload, from, through, (row, date) => {
    const forcedSalePct = numeric(row.TMPV7);
    if (forcedSalePct != null && (forcedSalePct < 0 || forcedSalePct > 100)) throw new Error("금투협 반대매매 비중 형식 오류");
    return { date, deposits: won(row.TMPV2, unit), derivativesDeposits: won(row.TMPV3, unit),
      unpaid: won(row.TMPV5, unit), forcedSale: won(row.TMPV6, unit), forcedSalePct };
  });
}

export function parseMarginLoans(payload: unknown, from: string, through: string, unit: AmountUnit = 1): MarginLoan[] {
  return parseRows(payload, from, through, (row, date) => {
    const total = won(row.TMPV2, unit), kospi = won(row.TMPV3, unit), kosdaq = won(row.TMPV4, unit);
    if (Math.abs(total - kospi - kosdaq) > (unit === 1 ? 0 : unit)) throw new Error("금투협 신용융자 시장 합계 불일치");
    return { date, total, kospi, kosdaq };
  });
}

export function parseFundFlows(payload: unknown, from: string, through: string, unit: AmountUnit = 1): FundFlow[] {
  return parseRows(payload, from, through, (row, date) => {
    if (row.TMPV99 !== "W") throw new Error("금투협 펀드 유출입 단위 확인 실패");
    const subscriptions = won(row.TMPV5, unit), redemptions = won(row.TMPV6, unit), net = won(row.TMPV7, unit, true);
    if (Math.abs(net - (subscriptions - redemptions)) > (unit === 1 ? 0 : unit)) throw new Error("금투협 국내 펀드 유출입 합계 불일치");
    return { date, subscriptions, redemptions, net };
  });
}

const compact = (date: string) => date.replaceAll("-", "");

function freeSis(object: string, from: string, through: string, unit: AmountUnit, filters: Record<string, string> = {}): Promise<unknown> {
  return readHttpsResponse(`${origin}/meta/getMetaDataList.do`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
    headers: { "content-type": "application/json", accept: "application/json", referer: `${origin}/` },
    body: JSON.stringify({ dmSearch: { tmpV40: String(unit), tmpV41: "1", tmpV1: "D", tmpV45: compact(from), tmpV46: compact(through), OBJ_NM: object, ...filters } }),
  }, async response => {
    if (!response.ok) throw new Error(`금투협 통계 HTTP ${response.status}`);
    try {
      return await response.json();
    } catch (error) {
      throw new Error("금투협 통계 JSON 응답 오류", { cause: error });
    }
  });
}

export async function collectMarketFunds(from: string, through: string, unit: AmountUnit = 1) {
  return parseMarketFunds(await freeSis("STATSCU0100000060BO", from, through, unit), from, through, unit);
}

export async function collectMarginLoans(from: string, through: string, unit: AmountUnit = 1) {
  return parseMarginLoans(await freeSis("STATSCU0100000070BO", from, through, unit), from, through, unit);
}

export async function collectFundFlows(from: string, through: string, includeEtf: boolean, unit: AmountUnit = 1) {
  const payload = await freeSis("STATFND0100100030BO", from, through, unit, {
    tmpV30: compact(from), tmpV31: compact(through), tmpV37: "0", tmpV3: "02", tmpV19: includeEtf ? "Y" : "N",
  });
  return parseFundFlows(payload, from, through, unit);
}

export async function collectFundBalance(from: string, through: string, item: "principal" | "nav", unit: AmountUnit = 1): Promise<FundBalance[]> {
  const payload = await freeSis("STATFND0100100260BO", from, through, unit, {
    tmpV30: compact(from), tmpV31: compact(through), tmpV10: "0", tmpV102: "1", tmpV100: item === "principal" ? "1" : "2",
  });
  return parseRows(payload, from, through, (row, date) => ({ date, value: won(row.TMPV2, unit) }));
}
