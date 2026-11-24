import type { IndicatorDefinition, SupplementalIndicator } from "@/lib/market/indicator-chart";
import { kofiaStatisticsUrl, type Dated } from "./market-liquidity-kofia";
import { readLiquidityPublication, type PublishedSeries } from "./market-liquidity-publication";

const kofia = { source: "금융투자협회 FreeSIS", sourceUrl: kofiaStatisticsUrl };
const krx = { source: "한국거래소 정보데이터시스템", sourceUrl: "https://data.krx.co.kr/" };
const marketFunds = { ...kofia, basis: "증시자금추이 · 원본 통계 기준일" };
const credit = { ...kofia, basis: "신용공여 잔고 추이 · 원본 통계 기준일" };
const fundBalance = { ...kofia, basis: "국내 주식형 펀드 · 운용일 기준 · ETF 포함" };
const fundFlow = { ...kofia, basis: "국내 주식형 펀드 · 결제일 기준 · 설정액 − 환매액" };
const daytime = { ...krx, basis: "KRX 주간 정규장 · 코스피200" };
const turnover = { ...krx, basis: "KRX 15:30 정규장 종가 기준 거래일 · 시장 일별 거래대금" };
const trillion = 1e12, hundredMillion = 1e8;

export async function readLiquidityComparison(): Promise<SupplementalIndicator[]> {
  const { saved, error } = await readLiquidityPublication()
    .then(saved => ({ saved, error: null }))
    .catch(() => ({ saved: null, error: "게시된 시장지표를 읽지 못했습니다." }));

  function series<T extends Dated>(
    group: SupplementalIndicator["group"], id: string, label: string, color: string, unit: IndicatorDefinition["unit"], rawGroup: string,
    publication: PublishedSeries<T> | undefined, getValue: (row: T) => number | null,
    source: { source: string; sourceUrl: string; basis: string }, differenceUnit: IndicatorDefinition["differenceUnit"] = null,
  ): SupplementalIndicator {
    const points = (publication?.value ?? []).flatMap(row => {
      const value = getValue(row);
      return value !== null && Number.isFinite(value) ? [{ date: row.date, value }] : [];
    });
    return {
      group,
      definition: { id, label, color, unit, rawGroup, axis: "right", calendar: "KRX", sourceUrl: source.sourceUrl, change: differenceUnit ? "absolute" : "return", differenceUnit },
      data: { points, ...(error ? { error } : {}), meta: { status: error ? "error" : points.length ? "ok" : "not_configured", source: source.source, basis: source.basis,
        asOf: points.at(-1)?.date, coverageStart: points[0]?.date, fetchedAt: publication?.collectedAt } },
    };
  }

  return [
    series("liquidity", "deposits", "투자자예탁금", "#2dd4bf", "조원", "cash", saved?.balance, row => row.deposits / trillion, { ...marketFunds, basis: "증시자금추이 · 장내파생 예수금 제외 · 원본 기준일" }),
    series("liquidity", "margin-loans", "신용융자잔고", "#fb7185", "조원", "cash", saved?.loans, row => row.total / trillion, credit),
    series("liquidity", "derivatives-deposits", "선물·옵션 예수금", "#fbbf24", "조원", "cash", saved?.balance, row => row.derivativesDeposits / trillion, { ...marketFunds, basis: "장내파생상품 거래예수금 · 증권회사 집계 · 원본 기준일" }),
    series("liquidity", "unpaid", "위탁매매 미수금", "#fdba74", "억원", "cash-eok", saved?.balance, row => row.unpaid / hundredMillion, marketFunds),
    series("liquidity", "forced-sale", "실제 반대매매", "#f87171", "억원", "cash-eok", saved?.balance, row => row.forcedSale / hundredMillion, marketFunds, "억원"),
    series("liquidity", "forced-sale-pct", "미수금 대비 반대매매 비중", "#f9a8d4", "%", "forced-sale-pct", saved?.balance, row => row.forcedSalePct, marketFunds, "pp"),
    series("liquidity", "kospi-turnover", "코스피 거래대금", "#93c5fd", "조원", "turnover", saved?.KOSPI, row => row.turnover === null ? null : row.turnover / trillion, turnover),
    series("liquidity", "kosdaq-turnover", "코스닥 거래대금", "#6ee7b7", "조원", "turnover", saved?.KOSDAQ, row => row.turnover === null ? null : row.turnover / trillion, turnover),
    series("funds", "equity-fund-principal", "주식형 수익증권 설정원본", "#a78bfa", "조원", "cash", saved?.principal, row => row.value / trillion, fundBalance),
    series("funds", "equity-fund-nav", "주식형 펀드 순자산", "#c4b5fd", "조원", "cash", saved?.nav, row => row.value / trillion, fundBalance),
    series("funds", "equity-fund-flow", "주식형 순설정액 · ETF 포함", "#67e8f9", "억원", "fund-flow", saved?.including, row => row.net / hundredMillion, fundFlow, "억원"),
    series("funds", "equity-fund-flow-ex-etf", "주식형 순설정액 · ETF 제외", "#818cf8", "억원", "fund-flow", saved?.excluding, row => row.net / hundredMillion, fundFlow, "억원"),
    series("derivatives", "foreign-futures", "코스피200 선물 외국인 순매수", "#38bdf8", "계약", "contracts", saved?.foreign, row => row.value, daytime, "계약"),
    series("derivatives", "open-interest", "코스피200 선물 미결제약정", "#a3e635", "계약", "contracts", saved?.totals, row => row.openInterest, daytime),
    series("derivatives", "put-call", "코스피200 옵션 풋·콜 비율", "#f0abfc", "배", "put-call", saved?.putCall, row => row.value, { ...daytime, basis: "KRX 주간 정규장 · 코스피200 월물 · 풋 거래량 ÷ 콜 거래량" }, "배"),
    series("derivatives", "vkospi", "코스피200 변동성지수", "#f472b6", "pt", "volatility", saved?.volatility, row => row.value, { ...daytime, basis: "V-KOSPI 200 · KRX 파생지수 15:45 KST 종가" }),
  ];
}
