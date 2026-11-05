import { krxClient } from "./krx-client";
import { fetchKrxDailyCloses } from "./krx-daily-prices";

type Row = Record<string, unknown>;
type Query = (bld: string, params: Record<string, string>) => Promise<Row>;
type Close = (code: string, through: string) => Promise<{ date: string; close: number | null }[]>;
function number(value: unknown): number {
  const text = typeof value === "string" || typeof value === "number" ? String(value).replace(/,/g, "").trim() : "";
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error("KRX 웹 숫자 오류");
  return Number(text);
}

/** KRX 웹 통계: 종목 정규장 종가를 독립적인 명시적 KRX 일봉과 대조한다. */
export function createInvestorKrxWebQuery(
  query: Query = (bld, params) => krxClient.query(bld, params),
  closes: Close = (code, through) => fetchKrxDailyCloses(code, through, fetch, 1),
): Query {
  return async (bld, params) => {
    if (bld !== "MDCSTAT01501" && bld !== "MDCSTAT00301") throw new Error("수급분석 KRX 웹 미지원 조회");
    if (bld === "MDCSTAT00301") {
      const { marketIndex, sessionDates: _ignored, ...rest } = params;
      const normalized = marketIndex === "KOSPI" ? { ...rest, indIdx: "1", indIdx2: "001" }
        : marketIndex === "KOSDAQ" ? { ...rest, indIdx: "2", indIdx2: "001" } : rest;
      return query(bld, normalized);
    }
    if (!["STK", "KSQ"].includes(params.mktId) || !/^\d{8}$/.test(params.trdDd)) throw new Error("KRX 웹 시세 요청 기준 오류");
    const payload = await query(bld, params);
    if (!Array.isArray(payload.OutBlock_1) || payload.OutBlock_1.length < 10) throw new Error("KRX 웹 전종목 시세 미반영");
    const market = params.mktId;
    const seen = new Set<string>();
    const candidates = (payload.OutBlock_1 as Row[]).map(row => {
      const code = String(row.ISU_SRT_CD ?? "");
      if (!/^[0-9A-Z]{6}$/.test(code) || seen.has(code) || row.MKT_ID !== market) throw new Error("KRX 웹 종목·시장 확인 실패");
      seen.add(code);
      const close = number(row.TDD_CLSPRC), shares = number(row.LIST_SHRS), cap = number(row.MKTCAP);
      if (close <= 0 || shares <= 0 || cap <= 0 || close * shares !== cap) throw new Error(`${code} KRX 웹 종가·시총 확인 실패`);
      return { code, close, cap };
    }).sort((a, b) => b.cap - a.cap).slice(0, 10);
    const day = `${params.trdDd.slice(0, 4)}-${params.trdDd.slice(4, 6)}-${params.trdDd.slice(6)}`;
    for (let i = 0; i < candidates.length; i += 4) {
      await Promise.all(candidates.slice(i, i + 4).map(async item => {
        const result = await closes(item.code, day);
        if (result.at(-1)?.date !== day || result.at(-1)?.close !== item.close) throw new Error(`${item.code} ${day} KRX 정규장 종가 교차검증 실패`);
      }));
    }
    return payload;
  };
}
