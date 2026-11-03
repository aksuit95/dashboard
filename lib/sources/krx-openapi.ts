import type { AppDatabase } from "@/lib/db/client";
import { CALENDAR_YEAR, KR_HOLIDAYS, KR_UNCONFIRMED } from "@/config/market-calendar";

type Row = Record<string, unknown>;
export const krxOpenApiServices = {
  "idx/kospi_dd_trd": "KOSPI 시리즈 일별시세정보",
  "idx/kosdaq_dd_trd": "KOSDAQ 시리즈 일별시세정보",
  "sto/stk_bydd_trd": "유가증권 일별매매정보",
  "sto/ksq_bydd_trd": "코스닥 일별매매정보",
  "drv/fut_bydd_trd": "선물 일별매매정보 (주식선물外)",
} as const;
export type KrxOpenApiService = keyof typeof krxOpenApiServices;

/** Production API only. Never send a personal key to a sample URL or return it in errors. */
export async function requestKrxOpenApi(service: KrxOpenApiService, basDd: string, fetchImpl: typeof fetch = fetch): Promise<Row[]> {
  const key = process.env.KRX_API_KEY?.trim();
  if (!key) throw new Error("KRX_API_KEY 환경변수 설정이 필요합니다.");
  if (!/^\d{8}$/.test(basDd)) throw new Error("KRX Open API 기준일 형식 오류");
  let response: Response;
  try {
    response = await fetchImpl(`https://data-dbg.krx.co.kr/svc/apis/${service}?basDd=${basDd}`, {
      cache: "no-store", headers: { AUTH_KEY: key, accept: "application/json" }, signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new Error(`KRX Open API 네트워크 오류 · ${krxOpenApiServices[service]}`); }
  if (response.status === 401 || response.status === 403) throw new Error(`KRX Open API ${response.status} · ${krxOpenApiServices[service]} 개별 이용 승인과 인증키 유효 상태를 확인해 주세요.`);
  if (!response.ok) throw new Error(`KRX Open API HTTP ${response.status} · ${krxOpenApiServices[service]}`);
  let data: { OutBlock_1?: unknown; respCode?: unknown };
  try { data = await response.json(); } catch { throw new Error("KRX Open API JSON 형식 오류"); }
  if (!data || typeof data !== "object" || !Array.isArray(data.OutBlock_1) || !data.OutBlock_1.length) throw new Error(`KRX Open API 데이터 없음 · ${krxOpenApiServices[service]} · ${basDd}`);
  if (data.OutBlock_1.some(r => !r || typeof r !== "object" || (r as Row).BAS_DD !== basDd)) throw new Error("KRX Open API 기준일 불일치 · 다른 날짜로 대체하지 않습니다.");
  return data.OutBlock_1 as Row[];
}

export function openApiSessions(from: string, through: string): string[] {
  const date = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}T00:00:00Z`);
  const dates: string[] = [];
  for (let i = 0; i < 366 && date.toISOString().slice(0, 10).replaceAll("-", "") <= through; i++, date.setUTCDate(date.getUTCDate() + 1)) {
    const iso = date.toISOString().slice(0, 10);
    if (+iso.slice(0, 4) !== CALENDAR_YEAR) throw new Error("한국 거래 캘린더 업데이트 필요");
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6 || KR_HOLIDAYS[iso]) continue;
    if (KR_UNCONFIRMED[iso]) throw new Error(`${iso} 특별 운영시간 확인 필요`);
    dates.push(iso.replaceAll("-", ""));
  }
  return dates.slice(-120);
}

/** Adapts only the supported quote APIs; investor statistics require the separate web session. */
export function createOpenApiQuery(db: AppDatabase, webQuery: (bld: string, params: Record<string, string>) => Promise<Row>, fetchImpl: typeof fetch = fetch) {
  db.exec("CREATE TABLE IF NOT EXISTS krx_openapi_daily (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL)");
  const pending = new Map<string, Promise<Row[]>>();
  async function daily(service: KrxOpenApiService, basDd: string): Promise<Row[]> {
    const cacheKey = JSON.stringify([1, "KRX_OPEN_API", service, basDd, "KRX_REGULAR_CLOSE"]);
    const saved = db.prepare("SELECT payload FROM krx_openapi_daily WHERE cache_key = ?").get(cacheKey) as { payload: string } | undefined;
    if (saved) return JSON.parse(saved.payload) as Row[];
    const active = pending.get(cacheKey); if (active) return active;
    const work = (async () => {
      const data = await requestKrxOpenApi(service, basDd, fetchImpl);
      db.prepare("INSERT OR REPLACE INTO krx_openapi_daily(cache_key, payload, fetched_at) VALUES (?, ?, ?)").run(cacheKey, JSON.stringify(data), new Date().toISOString());
      return data;
    })();
    pending.set(cacheKey, work);
    try { return await work; } finally { pending.delete(cacheKey); }
  }
  return async (bld: string, params: Record<string, string>): Promise<Row> => {
    if (bld === "MDCSTAT01501") {
      const service = params.mktId === "STK" ? "sto/stk_bydd_trd" : params.mktId === "KSQ" ? "sto/ksq_bydd_trd" : null;
      if (!service) throw new Error("KRX Open API 지원 시장 오류");
      const data = await daily(service, params.trdDd);
      return { OutBlock_1: data.map(r => ({ ...r, ISU_SRT_CD: r.ISU_CD, ISU_ABBRV: r.ISU_NM })) };
    }
    if (bld === "MDCSTAT00301") {
      const marketIndex = params.marketIndex;
      if (marketIndex && marketIndex !== "KOSPI" && marketIndex !== "KOSDAQ") throw new Error("KRX Open API 지원 지수 오류");
      const kospi = marketIndex ? marketIndex === "KOSPI" : params.indIdx === "1" && params.indIdx2 === "028";
      if (!marketIndex && !kospi && !(params.indIdx === "2" && params.indIdx2 === "203")) throw new Error("KRX Open API 지원 지수 오류");
      const service = kospi ? "idx/kospi_dd_trd" : "idx/kosdaq_dd_trd";
      const target = marketIndex ? (kospi ? "코스피" : "코스닥") : (kospi ? "코스피200" : "코스닥150");
      async function indexAt(date: string) {
        const matches = (await daily(service, date)).filter(r => String(r.IDX_NM).replace(/\s/g, "") === target);
        if (matches.length !== 1) throw new Error(`${date} ${target} KRX 지수 종가 확인 실패`);
        return { ...matches[0], TRD_DD: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` };
      }
      // Check authorization and latest availability before backfilling historical dates.
      const latest = await indexAt(params.endDd);
      let dates: string[];
      if (params.sessionDates) {
        let requested: unknown;
        try { requested = JSON.parse(params.sessionDates); } catch { throw new Error("KRX 지수 거래일 목록 오류"); }
        if (!Array.isArray(requested) || !requested.length || requested.length > 300 || requested.some(date => typeof date !== "string" || !/^\d{8}$/.test(date) || date > params.endDd) || new Set(requested).size !== requested.length) throw new Error("KRX 지수 거래일 목록 오류");
        dates = requested.filter(date => date !== params.endDd);
      } else dates = openApiSessions(params.strtDd, params.endDd).filter(date => date !== params.endDd);
      const output = [];
      for (let i = 0; i < dates.length; i += 4) output.push(...await Promise.all(dates.slice(i, i + 4).map(indexAt)));
      return { output: [...output, latest] };
    }
    if (bld === "MDCSTAT12501") {
      if (params.aggBasTpCd !== "0") throw new Error("선물 Open API는 정규장만 연결합니다.");
      const product = params.prodId === "KR___FUK2I" ? "코스피200선물" : params.prodId === "KR___FUKQI" ? "코스닥150선물" : null;
      if (!product) throw new Error("KRX Open API 지원 선물 상품 오류");
      const output = (await daily("drv/fut_bydd_trd", params.trdDd)).filter(r => r.MKT_NM === "정규" && String(r.PROD_NM).replace(/\s/g, "") === product).map(r => ({ ...r, ISU_SRT_CD: r.ISU_CD }));
      if (!output.length) throw new Error("KRX Open API 해당 상품의 정규장 선물 없음 · 야간으로 대체하지 않습니다.");
      return { output };
    }
    return webQuery(bld, params);
  };
}
