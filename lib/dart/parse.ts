const EOK = 100_000_000;
const JO = 1_000_000_000_000;

export type ParsedDisclosure = {
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  contractAmount?: number;
  dividendPerShare?: number;
};

export type ParseResult = { ok: true; fields: ParsedDisclosure } | { ok: false; reason: string };

export function categorizeReport(name: string): "earnings" | "contract" | "shareholder" | "other" {
  if (/실적|잠정/.test(name)) return "earnings";
  if (/단일판매|공급계약/.test(name)) return "contract";
  if (/배당|주주환원|자기주식/.test(name)) return "shareholder";
  return "other";
}

export function passesMarketCapFilter(marketCapKrw: number | null): "include" | "exclude" | "unknown" {
  if (marketCapKrw == null || !Number.isFinite(marketCapKrw)) return "unknown";
  if (marketCapKrw < 100_000_000_000) return "exclude";
  return "include";
}

export function parseKoreanAmount(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "").replace(/\s+/g, "");
  if (!text) return null;
  const negative = text.startsWith("-") || text.startsWith("△") || text.startsWith("▲");
  const body = text.replace(/^[+\-△▲]/, "").replace(/원$/, "");
  const match = body.match(/^(-?\d+(?:\.\d+)?)(조|억|만)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2];
  const scale = unit === "조" ? JO : unit === "억" ? EOK : unit === "만" ? 10_000 : 1;
  return (negative ? -value : value) * scale;
}

function field(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]\\s*([^\\n]+)`);
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseKoreanAmount(match[1].split(/[()]/)[0] ?? "");
    if (amount != null) return amount;
  }
  return undefined;
}

export function parseDisclosure(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "본문이 비어 있습니다." };
  const fields: ParsedDisclosure = {};
  const revenue = field(trimmed, ["매출액", "매출"]);
  const operatingIncome = field(trimmed, ["영업이익", "영업익"]);
  const netIncome = field(trimmed, ["순이익", "당기순이익"]);
  const contractAmount = field(trimmed, ["계약금액"]);
  const dividendPerShare = field(trimmed, ["1주당", "주당배당금"]);
  if (revenue != null) fields.revenue = revenue;
  if (operatingIncome != null) fields.operatingIncome = operatingIncome;
  if (netIncome != null) fields.netIncome = netIncome;
  if (contractAmount != null) fields.contractAmount = contractAmount;
  if (dividendPerShare != null) fields.dividendPerShare = dividendPerShare;
  if (!Object.keys(fields).length) return { ok: false, reason: "인식한 금액 필드가 없습니다." };
  return { ok: true, fields };
}

export function perFromEarnings(marketCapKrw: number | null, netIncome: number | undefined): number | null {
  if (marketCapKrw == null || netIncome == null || netIncome === 0) return null;
  if (!Number.isFinite(marketCapKrw) || !Number.isFinite(netIncome)) return null;
  return marketCapKrw / netIncome;
}
