import { empty, ok, stale, type SourceResult } from "@/lib/sources/types";

const HEADERS = { "user-agent": "Mozilla/5.0" };

export type EtfHolding = {
  symbol: string;
  name: string;
  weight: number;
};

export type EtfFacts = {
  shares: number | null;
  nav: number | null;
  aum: number | null;
  holdings: EtfHolding[];
};

function plainNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** "4조 9,402억" 처럼 화면용 한글 금액을 원으로 바꾼다. */
export function parseKoreanDisplay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/,/g, "").replace(/\s+/g, "");
  if (!text) return null;
  const jo = text.match(/(\d+(?:\.\d+)?)조/);
  const eok = text.match(/(\d+(?:\.\d+)?)억/);
  const man = text.match(/(\d+(?:\.\d+)?)만/);
  if (!jo && !eok && !man) return plainNumber(text);
  let total = 0;
  if (jo) total += Number(jo[1]) * 1e12;
  if (eok) total += Number(eok[1]) * 1e8;
  if (man) total += Number(man[1]) * 1e4;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function asWeights(rows: EtfHolding[]): EtfHolding[] {
  const sum = rows.reduce((total, row) => total + row.weight, 0);
  if (sum > 0 && sum <= 1.5) return rows.map((row) => ({ ...row, weight: row.weight * 100 }));
  return rows;
}

/** basic.nav 만 쓴다. iNav 와 시장 가격은 NAV 가 아니다. 좌수는 순자산총액 / NAV. */
export function parseNaverEtfBasic(payload: unknown): EtfFacts | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const nav = plainNumber(row.nav);
  const aum = parseKoreanDisplay(row.totalNav);
  const shares = nav != null && nav > 0 && aum != null ? aum / nav : null;
  const holdings: EtfHolding[] = [];
  if (Array.isArray(row.constituentList)) {
    for (const item of row.constituentList) {
      if (!item || typeof item !== "object") continue;
      const constituent = item as Record<string, unknown>;
      const symbol = String(constituent.itemCode ?? "").trim();
      const name = String(constituent.itemName ?? "").trim();
      const weight = plainNumber(constituent.constituentWeight);
      if (!symbol || !name || weight == null || weight < 0) continue;
      holdings.push({ symbol, name, weight });
    }
  }
  if (nav == null && shares == null && !holdings.length) return null;
  return { shares, nav, aum, holdings: asWeights(holdings) };
}

export async function fetchNaverEtf(code: string): Promise<SourceResult<EtfFacts>> {
  try {
    const response = await fetch(`https://m.stock.naver.com/api/etf/${code}/basic`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return stale(`ETF 응답 ${response.status}`);
    const parsed = parseNaverEtfBasic(await response.json());
    if (!parsed) return stale("ETF 응답 형식");
    if (parsed.nav == null && !parsed.holdings.length) return empty("ETF NAV 와 구성종목이 없습니다.");
    return ok(parsed);
  } catch (error) {
    return stale(error instanceof Error ? error.message : "ETF 수집 실패");
  }
}
