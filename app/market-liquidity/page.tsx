import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { IndexTurnoverChart, LiquidityChart, type LiquiditySeries } from "@/components/MarketLiquidityCharts";
import { changeOver, creditToMarketCap, type Point } from "@/lib/market/market-liquidity";
import { kofiaStatisticsUrl } from "@/lib/sources/market-liquidity-kofia";
import { loadEquityFunds, loadLiquidityDerivatives, loadLiquidityFunds, loadLiquidityIndices } from "@/lib/sources/market-liquidity";

export const metadata = { title: "증시자금 · 시장지표 | mk리서치" };
export const dynamic = "force-dynamic";

const tabs = [
  { id: "liquidity", label: "증시자금" },
  { id: "funds", label: "주식형 펀드" },
  { id: "profile", label: "지수 매물대" },
  { id: "derivatives", label: "파생 포지션" },
] as const;

const panel = "rounded-xl border border-white/10 bg-[#151a22] p-4";
const krx = "https://data.krx.co.kr/";
const valueText = (value: number, unit: string) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: unit === "계약" ? 0 : 2 })}${unit === "배" || unit === "%" ? "" : " "}${unit}`;
const signed = (value: number | null, unit: string) => value == null ? "—" : `${value > 0 ? "+" : ""}${valueText(value, unit)}`;

function series<T extends { date: string }>(id: string, name: string, unit: string, rows: T[] | null, get: (row: T) => number | null): LiquiditySeries {
  return { id, name, unit, points: (rows ?? []).flatMap(row => {
    const value = get(row);
    return value == null ? [] : [{ date: row.date, value }];
  }) };
}

function money<T extends { date: string }>(id: string, name: string, rows: T[] | null, get: (row: T) => number, unit = "조원") {
  const divisor = unit === "조원" ? 1e12 : 1e8;
  return series(id, name, unit, rows, row => get(row) / divisor);
}

function MetricCard({ item, details, changes = false }: { item: LiquiditySeries; details?: React.ReactNode; changes?: boolean }) {
  const latest = item.points.at(-1);
  return <section className={panel}>
    <h2 className="text-sm font-medium text-zinc-300">{item.name}</h2>
    <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-100">{latest ? valueText(latest.value, item.unit) : "—"}</p>
    <p className="mt-1 text-xs text-zinc-400">{latest ? `기준일 ${latest.date}` : "확인된 자료 없음"}</p>
    {changes ? <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-zinc-400">
      {[5, 20].map(days => <div className="flex gap-1" key={days}><dt>{days}거래일 증감</dt><dd className="tabular-nums text-zinc-200">{signed(changeOver(item.points, days), item.unit)}</dd></div>)}
    </dl> : null}
    {details ? <div className="mt-3 space-y-1 text-xs text-zinc-400">{details}</div> : null}
  </section>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-sm leading-relaxed text-zinc-400">{children}</p>;
}

function Source({ label, url, timestamps = [] }: { label: string; url: string; timestamps?: (string | null)[] }) {
  const latest = timestamps.filter((stamp): stamp is string => stamp != null).sort().at(-1);
  return <p className="mt-4 text-xs text-zinc-400">
    출처 <a className="underline underline-offset-2" href={url} target="_blank" rel="noreferrer">{label}</a>
    {latest ? ` · 최근 수집 ${new Date(latest).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} KST` : ""}
  </p>;
}

function Notices({ errors }: { errors: (string | null)[] }) {
  const messages = [...new Set(errors.filter(Boolean))];
  return messages.length ? <p role="status" className="my-4 text-sm text-amber-300">{messages.join(" · ")}</p> : null;
}

function comparison(indices: Awaited<ReturnType<typeof loadLiquidityIndices>>) {
  return { KOSPI: closePoints(indices.KOSPI.value), KOSDAQ: closePoints(indices.KOSDAQ.value) };
}

function closePoints(rows: { date: string; close: number }[] | null): Point[] {
  return (rows ?? []).map(row => ({ date: row.date, value: row.close }));
}

async function Liquidity({ now }: { now: Date }) {
  const [{ balance, loans }, indices] = await Promise.all([loadLiquidityFunds(now), loadLiquidityIndices(now)]);
  const deposits = money("deposits", "투자자예탁금", balance.value, row => row.deposits);
  const totalCredit = money("credit", "신용융자잔고", loans.value, row => row.total);
  const kospiCredit = money("kospi-credit", "코스피 신용융자", loans.value, row => row.kospi);
  const kosdaqCredit = money("kosdaq-credit", "코스닥 신용융자", loans.value, row => row.kosdaq);
  const derivatives = money("derivative-deposits", "장내파생상품 거래예수금", balance.value, row => row.derivativesDeposits);
  const unpaid = money("unpaid", "위탁매매 미수금", balance.value, row => row.unpaid, "억원");
  const forced = money("forced-sale", "실제 반대매매 체결액", balance.value, row => row.forcedSale, "억원");
  const forcedPct = series("forced-sale-pct", "미수금 대비 반대매매 비중", "%", balance.value, row => row.forcedSalePct);
  const creditRatio = (["KOSPI", "KOSDAQ"] as const).map((market) => ({ id: `${market}-credit-ratio`, name: `${market === "KOSPI" ? "코스피" : "코스닥"} 시총 대비 신용융자`, unit: "%",
    points: creditToMarketCap((loans.value ?? []).map(row => ({ date: row.date, balance: market === "KOSPI" ? row.kospi : row.kosdaq })), indices[market].value ?? []),
  }));
  return <>
    <Note>투자자예탁금은 파생 예수금을 제외합니다. 파생 예수금은 증권회사 집계이며, 실제 반대매매는 전일 미수금에 대한 금투협 공표값입니다.</Note>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard item={deposits} changes />
      <MetricCard item={totalCredit} changes details={loans.value?.at(-1) ? <p>코스피 {valueText(kospiCredit.points.at(-1)!.value, "조원")} · 코스닥 {valueText(kosdaqCredit.points.at(-1)!.value, "조원")}</p> : null} />
      <MetricCard item={derivatives} changes />
      <MetricCard item={unpaid} changes details={balance.value?.at(-1) ? <p>반대매매 {valueText(forced.points.at(-1)!.value, "억원")}{balance.value.at(-1)!.forcedSalePct != null ? ` · 원본 비중 ${valueText(balance.value.at(-1)!.forcedSalePct!, "%")}` : ""}</p> : null} />
    </div>
    <Notices errors={[balance.error, loans.error]} />
    <LiquidityChart series={[deposits, totalCredit, kospiCredit, kosdaqCredit, derivatives, unpaid, forced, forcedPct, ...creditRatio]} comparison={comparison(indices)} />
    <Source label="금융투자협회 FreeSIS · 증시자금추이 / 신용공여 잔고 추이" url={kofiaStatisticsUrl} timestamps={[balance.collectedAt, loans.collectedAt]} />
  </>;
}

async function FundFlows({ now }: { now: Date }) {
  const [{ including, excluding, fundPrincipal, fundNav }, indices] = await Promise.all([loadEquityFunds(now), loadLiquidityIndices(now)]);
  const net = money("net", "순설정액 · ETF 포함", including.value, row => row.net, "억원");
  const netEx = money("net-ex", "순설정액 · ETF 제외", excluding.value, row => row.net, "억원");
  const setting = money("principal", "설정원본", fundPrincipal.value, row => row.value);
  const nav = money("nav", "순자산총액", fundNav.value, row => row.value);
  const subscriptions = money("subscriptions", "설정 · ETF 포함", including.value, row => row.subscriptions, "억원");
  const redemptions = money("redemptions", "환매 · ETF 포함", including.value, row => row.redemptions, "억원");
  const subscriptionsEx = money("subscriptions-ex", "설정 · ETF 제외", excluding.value, row => row.subscriptions, "억원");
  const redemptionsEx = money("redemptions-ex", "환매 · ETF 제외", excluding.value, row => row.redemptions, "억원");
  return <>
    <Note>국내 주식형 기준입니다. 순설정액은 결제일 기준 설정액에서 환매액을 뺀 금액입니다. 설정원본·순자산은 운용일 기준이며 ETF를 포함합니다.</Note>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[net, netEx, setting, nav].map(item => <MetricCard key={item.id} item={item} />)}
    </div>
    <Notices errors={[including.error, excluding.error, fundPrincipal.error, fundNav.error]} />
    <LiquidityChart series={[net, netEx, setting, nav, subscriptions, redemptions, subscriptionsEx, redemptionsEx]} comparison={comparison(indices)} />
    <Source label="금융투자협회 FreeSIS · 기간자금유출입 / 유형별기간설정" url={kofiaStatisticsUrl} timestamps={[including.collectedAt, excluding.collectedAt, fundPrincipal.collectedAt, fundNav.collectedAt]} />
  </>;
}

async function Profile({ now }: { now: Date }) {
  const indices = await loadLiquidityIndices(now);
  const markets = ["KOSPI", "KOSDAQ"] as const;
  const lagging = markets.filter(market => indices[market].value?.at(-1)?.date !== indices.through);
  return <>
    <Note>일봉 종가 기준 추정입니다. 각 KRX 거래일의 시장 거래대금 전액을 그날의 15:30 종가가 속한 지수 구간에 배정합니다. 가로 막대는 구간별 거래대금 비중입니다.</Note>
    {lagging.length ? <Notices errors={[`${indices.through} KRX 15:30 종가 미확인 · ${lagging.map(market => market === "KOSPI" ? "코스피" : "코스닥").join(", ")}`]} /> : null}
    <div className="grid gap-4 xl:grid-cols-2">
      {markets.map(market => <IndexTurnoverChart key={market} market={market} rows={indices[market].value ?? []} />)}
    </div>
    <Notices errors={markets.map(market => indices[market].error)} />
    <Source label="한국거래소 통계정보 · 개별지수 시세 추이" url={krx} timestamps={[indices.KOSPI.collectedAt, indices.KOSDAQ.collectedAt]} />
  </>;
}

async function Derivatives({ now }: { now: Date }) {
  const { totals, foreign, vkospi, ratio, ratioMissing } = await loadLiquidityDerivatives(now);
  const net = { id: "foreign", name: "코스피200 선물 외국인 순매수", unit: "계약", points: foreign.value ?? [] };
  const oi = series("oi", "코스피200 선물 미결제약정", "계약", totals.value, row => row.openInterest);
  const putCall = { id: "pcr", name: "코스피200 옵션 풋/콜 거래량", unit: "배", points: ratio };
  const volatility = { id: "vkospi", name: "코스피200 변동성지수", unit: "pt", points: vkospi.value ?? [] };
  return <>
    <Note>KRX 주간 정규장 기준입니다. 선물은 전 월물 합계, 옵션은 코스피200 월물의 풋 거래량 ÷ 콜 거래량입니다. V-KOSPI 200은 옵션 기반 지수로 정규 기준 시각은 15:45 KST입니다.</Note>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard item={net} />
      <MetricCard item={oi} details={<p>직전 관측일 대비 {signed(changeOver(oi.points, 1), "계약")}</p>} />
      <MetricCard item={putCall} details={<p>최근 {ratio.length}일 확인{ratioMissing ? ` · ${ratioMissing}일 결측` : ""}</p>} />
      <MetricCard item={volatility} />
    </div>
    <Notices errors={[totals.error, foreign.error, vkospi.error, ratioMissing ? "KRX 원본 거래량을 대조할 수 없는 풋/콜 관측일이 있습니다." : null]} />
    <LiquidityChart series={[net, oi, putCall, volatility]} />
    <Source label="한국거래소 통계정보 · 파생상품 주요통계 / 투자자별 거래실적 / 파생지수 시세" url={krx} timestamps={[totals.collectedAt, foreign.collectedAt, vkospi.collectedAt]} />
  </>;
}

const sections = { liquidity: Liquidity, funds: FundFlows, profile: Profile, derivatives: Derivatives };

export default async function MarketLiquidityPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const active = tabs.find(tab => tab.id === view)?.id ?? "liquidity";
  const Section = sections[active];
  return <div>
    <PageHeader title="증시자금 · 시장지표" description="증시 대기자금, 신용 레버리지, 펀드 유출입과 KRX 시장 흐름을 확인합니다." />
    <nav aria-label="시장지표" className="mb-5 flex flex-wrap gap-2 border-b border-white/10 pb-3">
      {tabs.map(tab => <Link key={tab.id} prefetch={false} aria-current={tab.id === active ? "page" : undefined} href={tab.id === "liquidity" ? "/market-liquidity" : `/market-liquidity?view=${tab.id}`}
        className={`rounded-md px-3 py-2 text-sm ${tab.id === active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-zinc-400 hover:text-white"}`}>{tab.label}</Link>)}
    </nav>
    <Suspense key={active} fallback={<p role="status" className="text-sm text-zinc-400">{tabs.find(tab => tab.id === active)?.label} 자료를 불러오는 중입니다.</p>}>
      <Section now={new Date()} />
    </Suspense>
  </div>;
}
