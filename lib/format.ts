export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatSigned(value: number, digits = 2): string {
  const prefix = value > 0 ? "+" : "";
  return prefix + formatNumber(value, digits);
}

export function formatPrice(value: number, currency: string): string {
  if (currency === "PERCENT") return `${formatNumber(value, 2)}%`;
  if (currency === "POINTS") return formatNumber(value, value >= 1000 ? 2 : 2);
  const digits = currency === "KRW" && Math.abs(value) >= 1000 ? 0 : 2;
  const body = formatNumber(value, digits);
  if (currency === "USD") return `$${body}`;
  if (currency === "EUR") return `€${body}`;
  if (currency === "KRW") return `₩${body}`;
  if (currency === "JPY") return `¥${body}`;
  return body;
}

export function formatCompact(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const unit = currency === "USD" ? "$" : currency === "KRW" ? "₩" : "";
  if (abs >= 1e12) return `${sign}${unit}${formatNumber(abs / 1e12, 2)}조`;
  if (abs >= 1e8) return `${sign}${unit}${formatNumber(abs / 1e8, 1)}억`;
  if (abs >= 1e4) return `${sign}${unit}${formatNumber(abs / 1e4, 1)}만`;
  return `${sign}${unit}${formatNumber(abs, 0)}`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "시각 없음";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function seoulToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
