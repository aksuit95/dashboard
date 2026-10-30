import { categorizeReport, passesMarketCapFilter } from "@/lib/dart/parse";
import { empty, ok, stale, type SourceResult } from "@/lib/sources/types";

export type DartFiling = {
  rceptNo: string;
  stockCode: string;
  corpName: string;
  reportName: string;
  category: string;
  rceptDt: string;
  url: string;
  parseStatus: "pending" | "failed";
  capFilter: "include" | "exclude" | "unknown";
  marketCapKrw: number | null;
};

type DartItem = {
  stock_code?: string;
  corp_name?: string;
  report_nm?: string;
  rcept_no?: string;
  rcept_dt?: string;
};

function seoulCompact(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date).replace(/-/g, "");
}

export async function fetchDartList(input: {
  apiKey: string | undefined;
  capsByCode: Map<string, number>;
  now?: Date;
}): Promise<SourceResult<DartFiling[]>> {
  if (!input.apiKey) return stale("DART_API_KEY 가 없습니다.");
  const end = input.now ?? new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    crtfc_key: input.apiKey,
    bgn_de: seoulCompact(start),
    end_de: seoulCompact(end),
    page_count: "100",
    page_no: "1",
  });
  try {
    const response = await fetch(`https://opendart.fss.or.kr/api/list.json?${params.toString()}`);
    if (!response.ok) return stale(`DART 응답 ${response.status}`);
    const body = (await response.json()) as { status?: string; message?: string; list?: DartItem[] };
    if (body.status !== "000") return stale(body.message || `DART 상태 ${body.status}`);
    const list = body.list ?? [];
    if (!list.length) return empty("기간 내 공시가 없습니다.");
    const filings = list
      .filter((item) => item.rcept_no && item.report_nm && item.corp_name)
      .map((item) => {
        const stockCode = item.stock_code ?? "";
        const marketCap = stockCode ? input.capsByCode.get(stockCode) ?? null : null;
        return {
          rceptNo: item.rcept_no as string,
          stockCode,
          corpName: item.corp_name as string,
          reportName: item.report_nm as string,
          category: categorizeReport(item.report_nm as string),
          rceptDt: item.rcept_dt ?? "",
          url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
          parseStatus: "pending" as const,
          capFilter: passesMarketCapFilter(marketCap),
          marketCapKrw: marketCap,
        };
      });
    return ok(filings);
  } catch (error) {
    return stale(error instanceof Error ? error.message : "DART 수집 실패");
  }
}
