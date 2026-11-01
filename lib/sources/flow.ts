import { ok, stale, empty, type SourceResult } from "@/lib/sources/types";

const URL = "https://stock.naver.com/api/domestic/market/trendDeposit";
const HEADERS = { "user-agent": "Mozilla/5.0", referer: "https://finance.naver.com/sise/sise_deposit.naver" };

/** 네이버 증시자금 금액은 억 원이다. 이 대시보드도 억 원으로 저장한다. */
export type FlowPoint = {
  date: string;
  deposits: number | null;
  credit: number | null;
  creditPct: number | null;
  kospi: number | null;
  kosdaq: number | null;
};

function amountEok(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function sessionDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function parseTrendDepositPage(payload: unknown): FlowPoint[] | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { content?: unknown }).content)) return null;
  const rows: FlowPoint[] = [];
  for (const item of (payload as { content: unknown[] }).content) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = sessionDate(row.bizdate);
    if (!date) continue;
    const deposits = amountEok(row.customerDeposit);
    const credit = amountEok(row.creditLoan);
    if (deposits == null && credit == null) continue;
    rows.push({ date, deposits, credit, creditPct: null, kospi: null, kosdaq: null });
  }
  return rows;
}

export async function fetchTrendDeposits(pages: number, pageSize = 100): Promise<SourceResult<FlowPoint[]>> {
  const rows: FlowPoint[] = [];
  try {
    for (let startIdx = 0; startIdx < pages; startIdx += 1) {
      const response = await fetch(`${URL}?startIdx=${startIdx}&pageSize=${pageSize}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (rows.length) return ok(rows);
        return stale(`증시자금 응답 ${response.status}`);
      }
      const body = (await response.json()) as { last?: boolean };
      const page = parseTrendDepositPage(body);
      if (!page) {
        if (rows.length) return ok(rows);
        return stale("증시자금 응답 형식");
      }
      rows.push(...page);
      if (body.last || page.length === 0) break;
    }
  } catch (error) {
    if (rows.length) return ok(rows);
    return stale(error instanceof Error ? error.message : "증시자금 수집 실패");
  }
  if (!rows.length) return empty("증시자금이 없습니다.");
  return ok(rows);
}
