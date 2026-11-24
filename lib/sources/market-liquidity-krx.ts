import { readFile } from "node:fs/promises";
import path from "node:path";
import { krxCloseTime } from "@/config/market-calendar";
import type { IndexDay, IndexMarket, Point } from "@/lib/market/market-liquidity";
import { krxDate, krxNumber, parseFuturesFlows } from "./investor-flow";
import { investorPublicationPath, validateInvestorPublication } from "./investor-flow-publication";
import { krxClient } from "./krx-client";

type Row = Record<string, unknown>;
const compact = (date: string) => date.replaceAll("-", "");
const terms = (from: string, through: string) => ({ strtDd: compact(from), endDd: compact(through) });
const daySession = { aggBasTpCd: "0" };
const regular1530 = (date: string) => krxCloseTime(date) === "15:30";

function rows(data: Row, key = "output"): Row[] {
  const result = data[key];
  if (!Array.isArray(result) || !result.length || result.some(row => !row || typeof row !== "object")) throw new Error("KRX 통계 자료 없음");
  return result as Row[];
}

function between<T extends { date: string }>(points: T[], from: string, through: string): T[] {
  const selected = points.filter(p => p.date >= from && p.date <= through).sort((a, b) => a.date.localeCompare(b.date));
  if (!selected.length || new Set(selected.map(p => p.date)).size !== selected.length) throw new Error("KRX 통계 기준일 확인 실패");
  return selected;
}

function nonNegative(raw: unknown): number {
  const number = krxNumber(raw);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("KRX 통계 정수 항목 오류");
  return number;
}

function positive(raw: unknown): number {
  const number = krxNumber(raw);
  if (number <= 0) throw new Error("KRX 지수 값 결측");
  return number;
}

/** KRX 개별지수 시세 추이. Cash close is KRX 15:30 and money=1 requests won. */
export async function collectCashIndex(market: IndexMarket, from: string, through: string): Promise<IndexDay[]> {
  const data = await krxClient.query("MDCSTAT00301", { indIdx: market === "KOSPI" ? "1" : "2", indIdx2: "001", ...terms(from, through) });
  return between(rows(data).map(row => ({
    date: krxDate(row.TRD_DD), close: positive(row.CLSPRC_IDX), turnover: nonNegative(row.ACC_TRDVAL), marketCap: nonNegative(row.MKTCAP),
  })).filter(row => regular1530(row.date)), from, through);
}

export async function readPublishedCashIndex(market: IndexMarket, from: string, through: string): Promise<IndexDay[]> {
  const base = path.join(process.cwd(), "public", "data", "market-indicators-live", market.toLowerCase());
  const universe = market === "KOSPI" ? "kospi200" : "kosdaq150";
  const turnoverFromPublication = readFile(investorPublicationPath, "utf8").then(raw => {
    const publication = validateInvestorPublication(JSON.parse(raw));
    const recent = publication.snapshots.filter(s => s.universe === universe && s.view === "index" && s.as_of <= through && s.toss)
      .sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
    const saved = recent?.toss ? JSON.parse(recent.toss) : null;
    return saved?.market === market && !saved.turnoverError && Array.isArray(saved.turnover) ? saved.turnover as Point[] : [];
  }).catch(() => []);
  const [prices, metadata, savedTurnover] = await Promise.all([
    readFile(`${base}.json`, "utf8").then(text => JSON.parse(text) as Point[]),
    readFile(`${base}.meta.json`, "utf8").then(text => JSON.parse(text)), turnoverFromPublication,
  ]);
  if (metadata.source !== "KRX 정보데이터시스템" || !/^KRX 정규장 (15:30|16:30) KST$/.test(metadata.basis) || !Array.isArray(prices) || metadata.asOf !== prices.at(-1)?.date) throw new Error("저장된 KRX 지수 종가 기준 확인 실패");
  const turnover = new Map<string, number>();
  for (const point of savedTurnover) turnover.set(krxDate(point.date), nonNegative(point.value));
  return between(prices.filter(point => regular1530(point.date)).map(point => ({
    date: krxDate(point.date), close: positive(point.value), turnover: turnover.get(point.date) ?? null, marketCap: null,
  })), from, through);
}

export type DerivativeDay = { date: string; openInterest: number; optionVolume: number };

export async function collectDerivativeTotals(from: string, through: string): Promise<DerivativeDay[]> {
  const data = await krxClient.query("dbms/MDC/EASY/main/MDCEASY01201", {
    mktTpCd: "0", inqTpCd: "SUM", pdTpCd: "D", ...terms(from, through), ...daySession, viewDetail: "1",
  });
  return between(rows(data, "OutBlock_1").map(row => ({ date: krxDate(row.BAS_DD), openInterest: nonNegative(row.NUM_ITM_VAL3), optionVolume: nonNegative(row.NUM_ITM_VAL25) })), from, through);
}

export async function collectForeignFutures(from: string, through: string): Promise<Point[]> {
  const product = "KR___FUK2I";
  const data = await krxClient.query("MDCSTAT13102", { isuCd: product, prodId: product, ...terms(from, through),
    inqTpCd: "2", prtType: "QTY", prtCheck: "SUN", ...daySession, isuOpt: "ALL" });
  return between(parseFuturesFlows(data, through).flatMap(row => row.foreign == null ? [] : [{ date: row.date, value: row.foreign }]), from, through);
}

export function parsePutCallRatio(data: Row, expectedVolume: number): number | null {
  let calls = 0, puts = 0;
  const contracts = new Set<string>();
  for (const row of rows(data)) {
    const side = /^코스피200\s+([CP])\s+20\d{4}\s+.+\s+\(주간\)$/.exec(String(row.ISU_NM))?.[1];
    const code = String(row.ISU_CD ?? "");
    if (!side || !code || contracts.has(code) || row.SECUGRP_ID !== "OP") throw new Error("코스피200 월물 옵션 주간장 종목 확인 실패");
    contracts.add(code);
    const volume = nonNegative(row.ACC_TRDVOL);
    if (side === "C") calls += volume;
    else puts += volume;
  }
  if (puts + calls !== expectedVolume) throw new Error("KRX 옵션 거래량 합계 불일치");
  return calls > 0 ? puts / calls : null;
}

export async function collectPutCall(day: Pick<DerivativeDay, "date" | "optionVolume">): Promise<Point | null> {
  const params = { trdDd: compact(day.date), prodId: "KR___OPK2I", ...daySession, isuOpt: "ALL" };
  const value = await krxClient.queryProjected("MDCSTAT12501", params, data => parsePutCallRatio(data, day.optionVolume));
  return value == null ? null : { date: day.date, value };
}

export async function collectPutCallSeries(days: DerivativeDay[], read = collectPutCall) {
  const ratio: Point[] = [];
  const recent = days.slice(-10);
  for (let i = 0; i < recent.length; i += 2) {
    const observations = await Promise.allSettled(recent.slice(i, i + 2).map(day => read(day)));
    for (const observation of observations) {
      if (observation.status === "fulfilled" && observation.value) ratio.push(observation.value);
    }
  }
  return { ratio, ratioMissing: recent.length - ratio.length };
}

/** KRX code 1/300 is V-KOSPI 200. This derivatives index has its own 15:45 close. */
export async function collectVolatilityIndex(from: string, through: string): Promise<Point[]> {
  const data = await krxClient.query("MDCSTAT01201", { indTpCd: "1", idxIndCd: "300", ...terms(from, through) });
  return between(rows(data).map(row => ({ date: krxDate(row.TRD_DD), value: positive(row.CLSPRC_IDX) })).filter(row => regular1530(row.date)), from, through);
}
