"use client";

import Link from "next/link";
import { financialMarkets, type FinancialMarket } from "@/lib/financials/types";
import { useEffect, useState } from "react";
import type { FinancialCandidate, PriceCandidate, RiskOutlook } from "@/lib/investment-risk/types";

const warningGuide = "https://kind.krx.co.kr/external/2026/06/04/000788/20260604002076/70805.htm";
const dangerGuide = "https://kind.krx.co.kr/external/2026/05/29/002183/20260529003475/68811.htm";
const capitalGuide = {
  KOSPI: "https://www.krx.co.kr/contents/LST/04/04010500/LST04010500.jsp",
  KOSDAQ: "https://kind.krx.co.kr/external/notice/dst/20260202/kosdaq_2.pdf",
};
const format = (n: number, digits = 0) => n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
const won = (n: number) => `${format(n)}원`;
const eok = (n: number) => `${format(n / 1e8, 2)}억원`;
const cell = "p-3";
const link = "text-cyan-300 underline underline-offset-2";
const button = "rounded-md border border-white/15 px-3 py-2 text-xs";
const marketName = { KOSPI: "코스피", KOSDAQ: "코스닥" };
const markets: FinancialMarket[] = ["KOSPI", "KOSDAQ"];
const nearEquityFloor = (row: FinancialCandidate) => row.equityFloor?.currentBelow || row.equityFloor?.projectedBelow;
const impairmentText = (pct: number | null) => pct == null ? "잠식률 미확인" : pct > 0 ? `자본잠식 ${format(pct, 2)}%` : "자본잠식 없음";

function RiskPriceTable({ rows, stage, limit }: { rows: PriceCandidate[]; stage: "warning" | "danger"; limit: number }) {
  const candidates = rows.flatMap(row => {
    const thresholds = row[stage].filter(rule => rule.gapPct <= limit).sort((a, b) => a.gapPct - b.gapPct);
    return thresholds.length ? [{ ...row, thresholds }] : [];
  }).sort((a, b) => a.thresholds[0].gapPct - b.thresholds[0].gapPct || a.name.localeCompare(b.name, "ko"));

  if (!candidates.length) return <p className="py-8 text-center text-sm text-zinc-400">이 상승률 범위에 해당하는 후보가 없습니다.</p>;
  return <div className="overflow-x-auto">
    <p className="mb-2 text-xs text-zinc-400">{candidates.length}개 후보 · 필요한 상승률이 낮은 순</p>
    <table className="w-full min-w-[700px] text-left text-sm">
      <thead className="border-b border-white/10 text-xs text-zinc-400"><tr>
        <th className={cell}>종목</th><th className={cell}>최근 KRX 종가</th><th className={cell}>비교 기준</th>
        <th className={cell}>다음 거래일 기준 종가</th><th className={cell}>필요한 추가 상승률</th><th className={cell}>기준가 도달 시 지수 조건</th>
      </tr></thead>
      <tbody>{candidates.map(row => <tr className="border-b border-white/5 align-top tabular-nums" key={row.code}>
        <td className={cell}><strong>{row.name}</strong><p className="text-xs text-zinc-500">{row.code} · {marketName[row.market]}</p></td>
        <td className={cell}>{won(row.close)}</td>
        <td className={cell}>{row.thresholds.map(rule => <p key={rule.days} className="leading-6">
          {rule.days}거래일 +{rule.rise}% <span className="text-xs text-zinc-400">({rule.baseDate} · {won(rule.base)})</span>
        </p>)}</td>
        <td className={cell}>{row.thresholds.map(rule => <p key={rule.days} className="leading-6">
          {won(rule.minimum)} 이상 <span className="text-xs text-zinc-400">· 최근 최고 {won(rule.high)}</span>
        </p>)}</td>
        <td className={`${cell} font-medium text-amber-200`}>{row.thresholds.map(rule => <p key={rule.days} className="leading-6">
          {rule.gapPct === 0 ? "보합으로 충족" : `+${format(Math.ceil(rule.gapPct * 100) / 100, 2)}%`}
        </p>)}</td>
        <td className={`${cell} text-xs text-zinc-400`}>{row.thresholds.map(rule => <p key={rule.days} className="leading-6">
          같은 기간 {format((rule.minimum - rule.base) / rule.base * 100 / rule.indexMultiple, 2)}% 이하
        </p>)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function RiskFinancialTable({ rows }: { rows: FinancialCandidate[] }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-zinc-400">조건에 맞는 재무 후보가 없습니다.</p>;
  return <div className="overflow-x-auto">
    <p className="mb-2 text-xs text-zinc-400">{rows.length}개 후보 · {rows.some(row => nearEquityFloor(row)) ? "자기자본 10억원 미달 먼저 · " : ""}예상 잠식률이 높은 순</p>
    <table className="w-full min-w-[850px] text-left text-sm">
      <thead className="border-b border-white/10 text-xs text-zinc-400"><tr>
        <th className={cell}>종목</th><th className={cell}>재무 기준일</th><th className={cell}>현재 상태</th>
        <th className={cell}>다음 공시에서 볼 조건</th><th className={cell}>같은 분기 순손실 반복 시</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.code} className="border-b border-white/5 align-top">
        <td className={cell}><Link className={link} href={`/financials?universe=${financialMarkets[row.market].universe}&code=${row.code}`}>{row.name}</Link><p className="text-xs text-zinc-500">{row.code} · {financialMarkets[row.market].label}</p></td>
        <td className={cell}>{row.periodEnd} · {row.scope === "CFS" ? "연결" : "별도"}
          <p><a className={`${link} text-xs`} href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row.receipt}`} target="_blank" rel="noreferrer">DART {row.filedAt}</a></p>
        </td>
        <td className={cell}>{impairmentText(row.impairmentPct)}
          {row.equityFloor && <p className={row.equityFloor.currentBelow ? "font-medium text-amber-200" : "text-xs text-zinc-400"}>
            자기자본 {eok(row.equity)}{row.equityFloor.currentBelow && " · 10억원 미만"}
          </p>}
          {row.repeatLoss != null && <p className="text-xs text-zinc-400">최근 분기 순손실 {eok(row.repeatLoss)}</p>}
        </td>
        <td className={cell}>{row.room == null ? "자본금 자료 미확보" : row.room <= 0 ? "최근 공시 잠식률이 50% 이상" : `자기자본 ${eok(row.room)} 감소 시 잠식률 50%`}
          {row.equityFloor && <p className="mt-1 text-xs text-zinc-400">
            {row.equityFloor.currentBelow ? "최근 공시 자기자본이 10억원 미만"
              : row.equityFloor.room === 0 ? "자기자본이 더 감소하면 10억원 미만"
                : `자기자본이 ${eok(row.equityFloor.room)}보다 더 감소하면 10억원 미만`}
          </p>}
          <p className="mt-1 text-xs text-zinc-400">사업연도 말 감사보고서 확인</p>
        </td>
        <td className={cell}>{row.projectedEquity == null ? "—" : <>
          <span className={(row.projectedPct ?? 0) >= 50 ? "font-medium text-amber-200" : ""}>{impairmentText(row.projectedPct)}</span>
          {(row.projectedPct ?? 0) >= 100 && <p className="text-xs text-amber-200">전액잠식 수준 · 상장 조치 확인</p>}
          {row.equityFloor && <p className={row.equityFloor.projectedBelow ? "font-medium text-amber-200" : "text-xs text-zinc-400"}>
            예상 자기자본 {eok(row.projectedEquity)}{row.equityFloor.projectedBelow && " · 10억원 미만"}
          </p>}
        </>}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function InvestmentRiskOutlook({ market, query, alerts, observedAt, alertsFailed }: {
  market: string; query: string; alerts: Record<string, string[]> | null; observedAt?: string; alertsFailed: boolean;
}) {
  const [mode, setMode] = useState<"warning" | "danger" | "financial">("warning");
  const [limit, setLimit] = useState(20);
  const [outlook, setOutlook] = useState<RiskOutlook | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/investment-risk/outlook", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("위험 후보 조회 실패");
        setOutlook(await response.json());
      })
      .catch(() => { if (!controller.signal.aborted) setOutlook(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const matches = (code: string, name: string, listing: string) =>
    (market === "전체" || market === listing) && `${name} ${code}`.toLowerCase().includes(query.trim().toLowerCase());
  const price = outlook?.price;
  const selectedMarkets = markets.filter(listing => market === "전체" || market === listing);
  const financialResults = selectedMarkets.map(listing => ({ listing, data: outlook?.financial?.[listing] }));
  const priceRows = (price?.rows ?? []).filter(row => {
    const labels = alerts?.[row.code] ?? [];
    const unavailable = labels.includes("투자위험") || labels.includes("거래정지");
    const warned = labels.includes("투자경고");
    return !unavailable && matches(row.code, row.name, row.market) && (mode === "danger" ? warned : !warned);
  });
  const financialRows = financialResults.flatMap(result => result.data?.rows ?? []).filter(row => matches(row.code, row.name, row.market))
    .sort((a, b) => Number(Boolean(nearEquityFloor(b))) - Number(Boolean(nearEquityFloor(a)))
      || (b.projectedPct ?? b.impairmentPct ?? -Infinity) - (a.projectedPct ?? a.impairmentPct ?? -Infinity)
      || a.name.localeCompare(b.name, "ko"));
  const alertStale = price && observedAt && Date.parse(observedAt) < Date.parse(`${price.asOf}T${price.asOf === "2026-11-19" ? "16:30" : "15:30"}:00+09:00`);
  return <div className="mt-5 space-y-4" aria-label="다음 위험 조건">
    <div className="flex flex-wrap items-center gap-2">
      {([["warning", "투자경고 후보"], ["danger", "투자위험·거래정지 후보"], ["financial", "재무·관리종목 점검"]] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={mode === value} className={`${button} ${mode === value ? "bg-rose-400/15 text-rose-200" : "text-zinc-400"}`} onClick={() => setMode(value)}>{label}</button>
      )}
      {mode !== "financial" && <label className="ml-auto text-xs text-zinc-400">추가 상승률 범위
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="ml-2 rounded border border-white/15 bg-[#0c1018] p-2 text-zinc-200">
          {[5, 10, 20, 30].map(value => <option value={value} key={value}>{value}% 이하</option>)}
        </select>
      </label>}
    </div>
    {loading ? <p role="status" className="py-8 text-sm text-zinc-400">위험 후보를 불러오는 중입니다.</p> : mode === "financial" ? <>
      <div className="space-y-1 text-xs leading-5 text-zinc-400">
        <p>현금·재무건전성 공시에서 최근 분기 순손실, 자본잠식률 25% 이상 또는 코스닥 자기자본 10억원 미만을 점검합니다. 손실 반복 시나리오는 같은 금액이 자기자본에서 다시 줄고 자본금은 유지된다고 가정합니다.</p>
        {selectedMarkets.includes("KOSPI") && <p>코스피는 사업연도 말 자본잠식률 50% 이상을 확인합니다. <a className={link} href={capitalGuide.KOSPI} target="_blank" rel="noreferrer">KRX 코스피 상장관리 기준</a></p>}
        {selectedMarkets.includes("KOSDAQ") && <p>코스닥은 사업연도 말 자본잠식률 50% 이상과 자기자본 10억원 미만을 확인합니다. 감사보고서, 거래소 공시 및 적용 예외를 함께 확인하세요. <a className={link} href={capitalGuide.KOSDAQ} target="_blank" rel="noreferrer">KRX 코스닥 정기결산 안내</a></p>}
        {financialResults.map(({ listing, data }) => <p key={listing} className={data ? "" : "text-amber-200"}>
          {financialMarkets[listing].label} · {data ? `재무 점검 가능 ${data.covered}/${data.total}개` : "저장 공시 자료 조회 불가"}
        </p>)}
      </div>
      {financialResults.some(({ data }) => data) && <RiskFinancialTable rows={financialRows} />}
    </> : <>
      <div className="space-y-1 text-xs leading-5 text-zinc-400">
        <p>{price ? `${price.asOf} KRX 정규장 ${price.asOf === "2026-11-19" ? "16:30" : "15:30"} 종가 · 수집 ${new Date(price.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} KST · 15거래일 비교 가능 ${price.covered}/${price.total}개` : "KRX 종가 이력을 확인할 수 없습니다."}</p>
        {price && price.expectedAsOf !== price.asOf && <p className="text-amber-200">저장된 종가 기준일의 다음 거래일을 가정한 결과입니다. 최신 완료 거래일 여부를 확인해 주세요.</p>}
        {alertStale && <p className="text-amber-200">시장경보 목록이 종가 기준일보다 오래되었습니다. 최근 지정·해제는 KIND에서 확인해 주세요.</p>}
        <p>기준 종가는 급등률과 최근 15거래일 최고 종가 조건을 함께 반영합니다. 지수 조건은 기준 종가에 도달했을 때 적용 지수가 오를 수 있는 최대 폭입니다. 실제 지정은 종목별 예고 기간과 적용 지수, 예외 요건을 확인해야 합니다. 표시 가격은 호가 단위와 개별 가격제한을 반영하기 전의 값입니다.</p>
        <p>{mode === "warning" ? "시총 상위 100위 이내와 저장 목록의 기존 투자경고·위험·거래정지 종목을 제외합니다." : "저장 목록에서 투자경고 상태인 종목을 대상으로 계산합니다."} <a className={link} href={mode === "warning" ? warningGuide : dangerGuide} target="_blank" rel="noreferrer">KIND 지정예고 예시</a></p>
      </div>
      {price && alerts ? <RiskPriceTable rows={priceRows} stage={mode} limit={limit} /> :
        <p role="status" className="py-6 text-sm text-amber-200">{!price ? "비교할 KRX 종가 이력이 없습니다." : alertsFailed ? "시장경보 목록을 확인할 수 없어 가격 후보를 분류할 수 없습니다." : "후보 분류에 필요한 시장경보 목록을 기다리는 중입니다."}</p>}
    </>}
  </div>;
}
