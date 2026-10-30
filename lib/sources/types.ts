export type SourceStatus = "ok" | "stale" | "empty";

export type SourceResult<T> =
  | { status: "ok"; data: T }
  | { status: "stale"; message: string }
  | { status: "empty"; message: string };

export type QuotePayload = {
  price: number;
  previousClose: number | null;
  asOf: string | null;
  session: "live" | "closed" | "unknown";
  fundingHourly: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  marketCapCurrency: string | null;
  nav: number | null;
};

export type DailyBarPayload = {
  date: string;
  close: number;
};

export function ok<T>(data: T): SourceResult<T> {
  return { status: "ok", data };
}

export function stale(message: string): SourceResult<never> {
  return { status: "stale", message };
}

export function empty(message: string): SourceResult<never> {
  return { status: "empty", message };
}
