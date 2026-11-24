import { readHttpsResponse } from "./https-response";

const origin = "https://freesis.kofia.or.kr";
export const kofiaStatisticsUrl = `${origin}/stats/siteMap.do`;

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

function won(value: unknown): number {
  const number = numeric(value);
  if (number == null || number < 0 || !Number.isSafeInteger(number)) throw new Error("금투협 통계 금액 형식 오류");
  return number;
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

export function parseMarketFunds(payload: unknown, from: string, through: string): MarketFunds[] {
  return parseRows(payload, from, through, (row, date) => {
    const forcedSalePct = numeric(row.TMPV7);
    if (forcedSalePct != null && (forcedSalePct < 0 || forcedSalePct > 100)) throw new Error("금투협 반대매매 비중 형식 오류");
    return { date, deposits: won(row.TMPV2), derivativesDeposits: won(row.TMPV3),
      unpaid: won(row.TMPV5), forcedSale: won(row.TMPV6), forcedSalePct };
  });
}

export function parseMarginLoans(payload: unknown, from: string, through: string): MarginLoan[] {
  return parseRows(payload, from, through, (row, date) => {
    const total = won(row.TMPV2), kospi = won(row.TMPV3), kosdaq = won(row.TMPV4);
    if (total !== kospi + kosdaq) throw new Error("금투협 신용융자 시장 합계 불일치");
    return { date, total, kospi, kosdaq };
  });
}

export function parseFundFlows(payload: unknown, from: string, through: string): FundFlow[] {
  return parseRows(payload, from, through, (row, date) => {
    if (row.TMPV99 !== "W") throw new Error("금투협 펀드 유출입 단위 확인 실패");
    const subscriptions = won(row.TMPV5), redemptions = won(row.TMPV6);
    const net = subscriptions - redemptions;
    if (net !== numeric(row.TMPV7)) throw new Error("금투협 국내 펀드 유출입 합계 불일치");
    return { date, subscriptions, redemptions, net };
  });
}

const compact = (date: string) => date.replaceAll("-", "");

function freeSis(object: string, from: string, through: string, filters: Record<string, string> = {}): Promise<unknown> {
  return readHttpsResponse(`${origin}/meta/getMetaDataList.do`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
    headers: { "content-type": "application/json", accept: "application/json", referer: `${origin}/` },
    body: JSON.stringify({ dmSearch: { tmpV40: "1", tmpV41: "1", tmpV1: "D", tmpV45: compact(from), tmpV46: compact(through), OBJ_NM: object, ...filters } }),
  }, response => {
    if (!response.ok) throw new Error(`금투협 통계 HTTP ${response.status}`);
    return response.json();
  });
}

export async function collectMarketFunds(from: string, through: string) {
  return parseMarketFunds(await freeSis("STATSCU0100000060BO", from, through), from, through);
}

export async function collectMarginLoans(from: string, through: string) {
  return parseMarginLoans(await freeSis("STATSCU0100000070BO", from, through), from, through);
}

export async function collectFundFlows(from: string, through: string, includeEtf: boolean) {
  const payload = await freeSis("STATFND0100100030BO", from, through, {
    tmpV30: compact(from), tmpV31: compact(through), tmpV37: "0", tmpV3: "02", tmpV19: includeEtf ? "Y" : "N",
  });
  return parseFundFlows(payload, from, through);
}

export async function collectFundBalance(from: string, through: string, item: "principal" | "nav"): Promise<FundBalance[]> {
  const payload = await freeSis("STATFND0100100260BO", from, through, {
    tmpV30: compact(from), tmpV31: compact(through), tmpV10: "0", tmpV102: "1", tmpV100: item === "principal" ? "1" : "2",
  });
  return parseRows(payload, from, through, (row, date) => ({ date, value: won(row.TMPV2) }));
}
