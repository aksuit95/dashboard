"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeCompany, discreteQuarters } from "@/lib/financials/analyze";
import { metricLabels, type FinancialBoard, type FinancialCompany, type Metric } from "@/lib/financials/types";
import { accountHelp, cardHelp, ratioHelp } from "@/components/financial-help";

const money = (v: number | null | undefined) => v == null ? "—" : (v / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
const pct = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}%`;
const multiple = (v: number | null) => v == null ? "—" : `${v.toFixed(2)}배`;
const kst = (date: string | null | undefined) => date ? new Date(date).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "—";
const tone = (v: number | null | undefined) => v == null ? "text-zinc-500" : v < 0 ? "text-amber-300" : "text-zinc-100";
const panel = "rounded-xl border border-white/10 bg-[#121720] p-4 sm:p-5";
const inputClass = "rounded-md border border-white/15 bg-[#0c1018] px-3 py-2 text-sm text-zinc-200";
const buttonClass = "rounded-md border border-white/15 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40";
type SortKey = "cash" | "fcf" | "average" | "yield" | "debt";

/** Native disclosure works with mouse, touch and keyboard; Escape closes the popup. */
function CardHelp({ label, content, alignRight = false }: { label: string; content: string[]; alignRight?: boolean }) {
  return <details className="group relative mt-3 text-left" onKeyDown={event => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
      event.stopPropagation();
    }
  }}>
    <summary aria-label={`${label} 설명 보기`} className="inline-flex cursor-pointer select-none items-center gap-1 rounded text-xs text-cyan-300 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
      <span aria-hidden="true">ⓘ</span><span className="group-open:hidden">설명 보기</span><span className="hidden group-open:inline">설명 닫기</span>
    </summary>
    <div className={`absolute top-full z-40 mt-2 w-80 max-w-[calc(100vw-3rem)] rounded-lg border border-cyan-400/30 bg-[#1a2531] p-4 text-xs leading-6 text-zinc-200 shadow-2xl ${alignRight ? "right-0" : "left-0"}`} role="region" aria-label={`${label} 설명`}>
      <p className="mb-2 font-semibold text-cyan-200">{label}</p>
      {content.map((paragraph, index) => <p key={index} className={index ? "mt-2" : ""}>{paragraph}</p>)}
    </div>
  </details>;
}

export function FinancialHealthBoard() {
  const [board, setBoard] = useState<FinancialBoard | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0), [query, setQuery] = useState(""), [industry, setIndustry] = useState("");
  const [kind, setKind] = useState("nonfinancial"), [filter, setFilter] = useState("all"), [sort, setSort] = useState<SortKey>("cash"), [desc, setDesc] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError(null);
    fetch("/api/financials", { cache: "no-store", signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "저장 자료 조회 실패");
      if (!controller.signal.aborted) { setBoard(data); setError(data.error); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "조회 실패"); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [reload]);
  const companies = board?.publication?.companies;
  const analyzed = useMemo(() => (companies ?? []).map(company => ({ company, analysis: analyzeCompany(company) })), [companies]);
  const industries = [...new Set(analyzed.map(r => r.company.industry))].sort((a, b) => a.localeCompare(b, "ko"));
  const nonfinancial = analyzed.filter(r => r.company.financial === false);
  const covered = analyzed.filter(r => r.analysis.latest?.values.cash != null).length;
  const reportsCovered = analyzed.filter(r => r.company.reports.length > 0).length;
  const collectionIssues = analyzed.filter(r => r.company.errors.length > 0).length;
  const fcfCovered = nonfinancial.filter(r => r.analysis.ttm?.fcf != null);
  const fcfPositive = fcfCovered.filter(r => r.analysis.ttm!.fcf! > 0).length;
  const warningCount = nonfinancial.filter(r => r.analysis.signals.some(s => s.severity === "warning")).length;
  const visible = analyzed.filter(({ company: c, analysis: a }) =>
    (kind === "all" || (kind === "financial" ? c.financial === true : c.financial === false)) &&
    (!industry || c.industry === industry) && `${c.code} ${c.name}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter === "all" || (filter === "positive" && a.ttm?.fcf != null && a.ttm.fcf > 0) || (filter === "negative" && a.ttm?.fcf != null && a.ttm.fcf < 0) || (filter === "warning" && a.signals.some(s => s.severity === "warning")) || (filter === "missing" && a.latest?.values.cash == null) || (filter === "stale" && (!a.latest || Date.now() - Date.parse(a.latest.periodEnd) > 200 * 86400000)))
  ).sort((a, b) => {
    const value = (row: typeof a) => sort === "cash" ? row.analysis.latest?.values.cash ?? null : sort === "fcf" ? row.analysis.ttm?.fcf ?? null : sort === "average" ? row.analysis.averageFcf : sort === "yield" ? row.analysis.fcfYield : row.analysis.reportedDebt;
    const av = value(a), bv = value(b);
    return av == null ? bv == null ? a.company.name.localeCompare(b.company.name, "ko") : 1 : bv == null ? -1 : (av - bv) * (desc ? -1 : 1);
  });
  const active = visible.find(r => r.company.code === selected)?.company ?? visible[0]?.company;
  const publication = board?.publication;
  const selectSort = (key: SortKey) => { if (sort === key) setDesc(v => !v); else { setSort(key); setDesc(true); } };
  const reportDates = [...new Set(analyzed.flatMap(r => r.analysis.latest ? [r.analysis.latest.periodEnd] : []))].sort();
  const priceDates = [...new Set(analyzed.flatMap(r => r.company.market ? [r.company.market.date] : []))].sort();
  return <section aria-label="현금·재무건전성 분석" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
      <span>공시 실적 · 단위 억원 · 연결 우선 / 별도 구분</span>
      <button type="button" disabled={busy} className={buttonClass} onClick={() => setReload(v => v + 1)}>{busy ? "불러오는 중…" : "저장 자료 새로고침"}</button>
    </div>
    {error && <div role="status" className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">{error}</div>}
    {publication && <>
      {collectionIssues > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/80"><span>보고서 확보 {reportsCovered}/{analyzed.length}개 기업 · 수집 확인 {collectionIssues}개. 미확보 자료는 결측이며, 기업별 오류와 실제 재무 기준일을 확인하세요.</span><button type="button" className={buttonClass} onClick={() => { setKind("all"); setFilter("missing"); setIndustry(""); setQuery(""); setSelected(null); }}>현금 미확보 기업 보기</button></div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["현금 잔액 확보", `${covered} / ${analyzed.length}개`, "현재 구성종목 기준"], ["TTM FCF 흑자", fcfCovered.length ? `${pct(fcfPositive / fcfCovered.length * 100)}` : "—", `비금융 ${fcfPositive} / ${fcfCovered.length}개 · 결측 제외`], ["유동성·현금흐름 경고", `${warningCount}개`, "비금융 · 근거 확인 필요"], ["공시 재무기간", reportDates.length ? reportDates.at(-1)! : "—", reportDates.length > 1 ? `기업별 상이 · ${reportDates[0]} ~ ${reportDates.at(-1)}` : "최근 확보한 결산일"]].map(([label, value, hint], index) => <div key={label} className={panel}><p className="text-xs text-zinc-400">{label}</p><p className="my-2 text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-zinc-500">{hint}</p><CardHelp label={label} content={cardHelp[label]} alignRight={index % 2 === 1} /></div>)}
      </div>
      <div className="text-xs leading-6 text-zinc-400">
        구성 확인 {kst(publication.membershipAt)} KST · 저장 {kst(publication.publishedAt)} KST<br />
        가격: {priceDates.length ? priceDates.join(", ") : "확보 실패"} · KRX 정규장 15:30 KST. 기업 상세에 가격 수집 시각 별도 표시.<br />
        {publication.membershipSource}. 금융업은 일반기업 FCF 평가에서 제외합니다.
      </div>
      <div className="flex flex-wrap gap-2">
        <input aria-label="기업명 또는 종목코드" placeholder="기업명 / 종목코드 검색" className={`${inputClass} min-w-48 flex-1`} value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="기업 구분" className={inputClass} value={kind} onChange={e => { setKind(e.target.value); setSelected(null); }}><option value="nonfinancial">비금융기업</option><option value="financial">금융기업 별도 보기</option><option value="all">전체·업종 미확인 포함</option></select>
        <select aria-label="업종" className={inputClass} value={industry} onChange={e => setIndustry(e.target.value)}><option value="">모든 업종</option>{industries.map(s => <option key={s}>{s}</option>)}</select>
        <select aria-label="재무 조건" className={inputClass} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">모든 재무 상태</option><option value="positive">TTM FCF 흑자</option><option value="negative">TTM FCF 적자</option><option value="warning">경고 신호</option><option value="missing">현금 잔액 결측</option><option value="stale">재무기간 200일 초과·미확보</option></select>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-xl border border-white/10">
        <table className="w-full whitespace-nowrap text-right text-xs tabular-nums"><caption className="p-3 text-left text-xs text-zinc-400">기업 비교 {visible.length}개 · 기업명을 선택하면 아래 상세 분석 · —는 결측 또는 적용 제외</caption><thead className="sticky top-0 z-10 bg-[#1c222b] text-zinc-400"><tr>
          <th className="p-3 text-left">기업 / 업종</th><th className="p-3">재무 기준일</th>
          {([["cash", "현금 잔액"], ["debt", "표기 차입금¹"], ["fcf", "TTM FCF"], ["average", "3년 평균 FCF"], ["yield", "FCF 수익률"]] as [SortKey, string][]).map(([key, label]) => <th key={key} className="p-3" aria-sort={sort === key ? desc ? "descending" : "ascending" : "none"}><button type="button" onClick={() => selectSort(key)}>{label} {sort === key ? desc ? "↓" : "↑" : "↕"}</button></th>)}
          <th className="p-3">CF 기말 현금</th>
          <th className="p-3">경고 / 수집 상태</th>
        </tr></thead><tbody>{visible.map(({ company: c, analysis: a }) => <tr key={c.code} className={`border-t border-white/5 ${active?.code === c.code ? "bg-cyan-400/10" : "hover:bg-white/5"}`}>
          <td className="p-3 text-left"><button type="button" aria-pressed={active?.code === c.code} className="text-left font-medium text-cyan-100" onClick={() => setSelected(c.code)}>{c.name}<span className="mt-1 block text-[11px] font-normal text-zinc-500">{c.code} · {c.industry}</span></button></td>
          <td className="p-3 text-zinc-400">{a.latest?.periodEnd ?? "미확보"}<span className="block text-[10px]">{a.latest ? a.latest.scope === "CFS" ? "연결" : "별도" : ""}</span></td>
          <td className="p-3">{money(a.latest?.values.cash)}</td><td className="p-3 text-zinc-400">{money(a.reportedDebt)}</td>
          <td className={`p-3 ${tone(a.ttm?.fcf)}`}>{money(a.ttm?.fcf)}</td><td className={`p-3 ${tone(a.averageFcf)}`}>{c.financial === false ? money(a.averageFcf) : "적용 제외"}</td><td className="p-3">{pct(a.fcfYield)}</td>
          <td className="p-3">{money(a.latest?.values.endingCash)}</td>
          <td className="p-3 text-zinc-400">{a.signals.filter(s => s.severity === "warning").length ? <span className="text-amber-300">경고 {a.signals.filter(s => s.severity === "warning").length}</span> : "—"}{c.errors.length > 0 && <span className="ml-2 text-amber-400">수집 확인 {c.errors.length}</span>}</td>
        </tr>)}</tbody></table>
        {!visible.length && <p className="p-8 text-center text-sm text-zinc-500">조건에 맞는 기업이 없습니다.</p>}
      </div>
      <CardHelp label="기업 비교표" content={cardHelp["기업 비교표"]} />
      <p className="text-xs leading-5 text-zinc-500">¹ 표기 차입금은 재무상태표에서 식별한 단기차입금·유동성장기부채·장기차입금과 비유동으로 확인된 사채의 부분 합계입니다. 만기 구분이 불명확한 사채와 주석 내 차입·리스·기타 금융부채는 빠질 수 있어 총차입금·순현금으로 확정하지 않습니다. 가용 유동성과 순차입금/EBITDA는 사용제한·주석·감가상각 데이터 검증 전까지 결측입니다. 금융자회사 포함 여부·기업 인수에 따라 연결 FCF와 부채의 업종 간 비교가 제한될 수 있습니다.</p>
      {active && <CompanyDetail key={active.code} company={active} />}
    </>}
    {!publication && !busy && <div className={panel}><p className="text-sm text-zinc-400">공식 재무제표가 저장되면 기업 비교와 상세 분석이 표시됩니다.</p></div>}
  </section>;
}

function CompanyDetail({ company }: { company: FinancialCompany }) {
  const [detail, setDetail] = useState<FinancialCompany | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/financials/${encodeURIComponent(company.code)}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || data.company?.code !== company.code) throw new Error(data.error ?? "공시 계정 조회 실패");
      if (!controller.signal.aborted) setDetail(data.company);
    }).catch(error => { if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "공시 계정 조회 실패"); });
    return () => controller.abort();
  }, [company]);
  const detailed = detail ? { ...detail, market: company.market } : company;
  return <>{detailError && <p role="alert" className="text-xs text-amber-300">공시 계정 상세: {detailError}</p>}<CompanyDetailContent company={detailed} loading={!detail && !detailError} /></>;
}

function CompanyDetailContent({ company, loading }: { company: FinancialCompany; loading: boolean }) {
  const a = useMemo(() => analyzeCompany(company), [company]), v = a.latest?.values;
  const [tab, setTab] = useState("history");
  const annual = [...a.annual].reverse();
  return <section className="space-y-4" aria-label={`${company.name} 상세 분석`}>
    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-6"><div><p className="mb-1 text-xs tracking-wider text-cyan-400">COMPANY CASH REVIEW</p><h2 className="text-xl font-semibold">{company.name} <span className="text-sm font-normal text-zinc-500">{company.code}</span></h2><p className="mt-2 text-xs text-zinc-400">{company.industry} · {a.latest?.periodEnd ?? "재무기간 미확보"} · {a.latest ? a.latest.scope === "CFS" ? "연결재무제표" : "별도재무제표" : ""}</p></div>{a.latest && <a className={buttonClass} href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${a.latest.receipt}`} target="_blank" rel="noreferrer">최신 공시 원문 ↗</a>}</div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["현금및현금성자산", money(v?.cash), "억원 · 사용제한 여부 미검증"], ["단기금융상품", money(v?.shortInvestments), "억원 · 가용 현금에 자동 합산 안 함"], ["TTM FCF", money(a.ttm?.fcf), a.ttm?.label ?? "산출 불가 / 금융업 제외"], ["유동비율 / 당좌비율", `${pct(a.currentRatio)} / ${pct(a.quickRatio)}`, "비금융기업 · 분모 양수일 때만 계산"]].map(([label, value, hint], index) => <div key={label} className={panel}><p className="text-xs text-zinc-400">{label}</p><p className="my-2 text-lg font-semibold tabular-nums">{value}</p><p className="text-[11px] text-zinc-500">{hint}</p><CardHelp label={label} content={cardHelp[label]} alignRight={index % 2 === 1} /></div>)}</div>
    <div className={panel}><h3 className="mb-3 text-sm font-medium">공시된 현금흐름과 부채 계정</h3><p className="mb-4 text-xs text-zinc-500">재무상태표는 결산일 잔액, 현금흐름표는 해당 사업연도 시작부터 결산일까지의 누적 금액입니다. 확인된 계정만 표시합니다.</p><dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">{(["endingCash", "ocf", "icf", "financing", "ppe", "intangible", "dividends", "buybacks", "shortDebt", "currentLongDebt", "longDebt", "bonds", "currentBonds", "currentLeases", "longLeases", "assetSales", "acquisitions"] as Metric[]).map((key, index) => <div key={key}><dt className="mb-1 text-zinc-500">{key === "endingCash" ? "현금흐름표 기말 현금" : metricLabels[key]}</dt><dd className="tabular-nums">{money(v?.[key])} 억원<CardHelp label={key === "endingCash" ? "현금흐름표 기말 현금" : metricLabels[key]} content={accountHelp[key]!} alignRight={index % 2 === 1} /></dd></div>)}</dl></div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="상세 항목">{[["history", "현금·FCF 이력"], ["accounts", "공시 계정"], ["evidence", "출처·계산 근거"]].map(([id, label]) => <button type="button" role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)} className={`${buttonClass} ${tab === id ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200" : ""}`}>{label}</button>)}</div>
    <div className={panel}><h3 className="mb-2 text-sm font-medium">점검 신호</h3><ul className="space-y-2 text-xs leading-5">{a.signals.length ? a.signals.map((s, i) => <li key={i} className={s.severity === "warning" ? "text-amber-300" : "text-zinc-400"}>{s.severity === "warning" ? "△ " : "· "}{s.text}</li>) : <li className="text-zinc-400">확보한 계정에서 감지된 경고 없음. 누락된 데이터로 인한 위험은 평가하지 못합니다.</li>}</ul>
      {company.errors.length > 0 && <details className="mt-3 text-xs text-amber-300"><summary className="cursor-pointer">수집 확인 {company.errors.length}건</summary><ul className="mt-2 space-y-1">{company.errors.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
      <CardHelp label="점검 신호" content={cardHelp["점검 신호"]} />
    </div>
    {tab === "history" && <>
      <div className="grid gap-4 xl:grid-cols-2"><div className={panel}><Trend title="연말 현금 잔액 · 억원" labels={annual.map(r => r.periodEnd.slice(0, 4))} series={[{ name: "현금", color: "#67e8f9", values: annual.map(r => company.reports.find(p => p.periodEnd === r.periodEnd && p.scope === r.scope)?.values.cash ?? null) }]} /></div>
        <div className={panel}>{company.financial === false ? <Trend title="연간 현금 창출력 · 억원" labels={annual.map(r => r.periodEnd.slice(0, 4))} series={[{ name: "영업현금흐름", color: "#67e8f9", values: annual.map(r => r.values.ocf) }, { name: "CAPEX", color: "#c4b5fd", values: annual.map(r => r.capex) }, { name: "FCF", color: "#fbbf24", values: annual.map(r => r.fcf) }]} /> : <><p className="text-sm text-zinc-400">금융업 현금은 예수금·금융자산 운용의 영향을 받습니다. 일반기업 FCF 차트와 순위를 적용하지 않습니다.</p><CardHelp label="연간 현금 창출력 · 억원" content={cardHelp["연간 현금 창출력 · 억원"]} alignRight /></>}</div></div>
      {company.financial === false && <>
        <div className={panel}><h3 className="mb-4 text-sm font-medium">최근 5개년 연간 실적 · 억원</h3><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs tabular-nums"><thead className="text-zinc-500"><tr>{["결산일 / 범위", "영업현금흐름", "CAPEX", "FCF", "배당", "자사주", "환원 후 잔여"].map(s => <th className="p-2" key={s}>{s}</th>)}</tr></thead><tbody>{annual.map(r => { const residual = r.fcf != null && r.values.dividends != null && r.values.buybacks != null ? r.fcf - r.values.dividends - r.values.buybacks : null; return <tr key={r.periodEnd} className="border-t border-white/5"><td className="p-2 text-zinc-400">{r.periodEnd} / {r.scope === "CFS" ? "연결" : "별도"}</td><td className="p-2">{money(r.values.ocf)}</td><td className="p-2">{money(r.capex)}</td><td className={`p-2 ${tone(r.fcf)}`}>{money(r.fcf)}</td><td className="p-2">{money(r.values.dividends)}</td><td className="p-2">{money(r.values.buybacks)}</td><td className="p-2">{money(residual)}</td></tr>; })}</tbody></table></div><CardHelp label="최근 5개년 연간 실적 · 억원" content={cardHelp["최근 5개년 연간 실적 · 억원"]} /></div>
        <div className={panel}><h3 className="mb-3 text-sm font-medium">현금 창출력과 상환 부담</h3><dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">{[["3년 평균 FCF", `${money(a.averageFcf)} 억원`], ["FCF 흑자 연도", `${a.profitableYears} / ${a.coveredYears}개 확보 연도`], ["TTM FCF 마진", pct(a.fcfMargin)], ["영업현금흐름 / 순이익", multiple(a.cashConversion)], ["영업이익 / 이자비용", multiple(a.interestCoverage)], ["표기 차입금 / 영업현금흐름", multiple(a.debtToOcf)], ["표기 단기 상환 부담¹", `${money(a.reportedCurrentDebt)} 억원`]].map(([label, value], index) => <div key={label}><dt className="mb-2 text-zinc-500">{label}</dt><dd>{value}<CardHelp label={label} content={ratioHelp[label]} alignRight={index % 2 === 1} /></dd></div>)}</dl><p className="mt-4 text-[11px] leading-5 text-zinc-500">¹ 단기차입금 + 유동성장기부채. 사채·리스·주석 만기 전체를 포괄하지 않을 수 있습니다. 분모가 0·음수인 배율은 표시하지 않습니다.</p></div>
        <details className={panel}><summary className="cursor-pointer text-sm">단일 분기 FCF 확인</summary><p className="my-3 text-xs text-zinc-500">각 분기 누적 CF에서 같은 연결·별도 범위의 직전 누적 CF를 차감합니다. 직전 분기가 없으면 결측입니다.</p><div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead><tr>{["기간", "영업현금흐름", "CAPEX", "FCF"].map(s => <th className="p-2" key={s}>{s}</th>)}</tr></thead><tbody>{discreteQuarters(company.reports).slice(-8).map(r => <tr key={r.period} className="border-t border-white/5"><td className="p-2">{r.period} / {r.scope}</td><td className="p-2">{money(r.ocf)}</td><td className="p-2">{money(r.capex)}</td><td className="p-2">{money(r.fcf)}</td></tr>)}</tbody></table></div></details>
      </>}
    </>}
    {tab === "accounts" && <div className={`${panel} text-xs leading-6 text-zinc-400`}>{loading ? <p>공시 계정을 불러오는 중입니다.</p> : <DisclosedAccounts report={a.latest} />}</div>}
    {tab === "evidence" && <div className={`${panel} space-y-4 text-xs leading-6 text-zinc-400`}>
      <p>공시일 {a.latest?.filedAt ?? "—"} (접수번호 기준, 시각 미제공) · 재무 수집 {kst(a.latest?.fetchedAt)} KST<br />가격 기준 {company.market?.date ?? "미확보"} · KRX 15:30 KST · 가격 수집 {kst(company.market?.fetchedAt)} KST<br />DART 업종코드 {company.industryCode ?? "미확인"} · {company.financialBasis ?? "업종 미확인"}</p>
      <p>FCF = 영업현금흐름 − 유형자산 취득 − 무형자산 취득. 기업 인수대금은 별도입니다. TTM = 직전 연간 + 당기 누적 − 전년 동기 누적. 손익계산서 분·반기는 누적 필드를 사용합니다. 연결과 별도는 혼합하지 않습니다.</p>
      <p>가용 유동성·총차입금·순현금·리스 포함 여부·순차입금/EBITDA·정확한 만기 구조는 주석 확인 전까지 확정하지 않습니다. 점수나 순현금 기업 수를 임의로 산출하지 않습니다. 정정공시는 재수집 시 접수번호를 갱신합니다. 이 페이지는 현재 구성기업의 최신 확보 공시를 보여주며 과거 시점 백테스트를 지원하지 않습니다.</p>
      {company.referenceFcf && <p className="rounded-lg bg-violet-400/5 p-3 text-violet-200">기존 보유 자료 참고: {company.referenceFcf.source} FCF {money(company.referenceFcf.value)}억원 · 구성일 {company.referenceFcf.compositionDate} · 원본 갱신 {company.referenceFcf.sourceUpdatedAt ?? "미제공"}<br />{company.referenceFcf.definition}</p>}
      <details><summary className="cursor-pointer text-zinc-200">최신 보고서 계정 매핑과 원문 금액</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead><tr>{["지표", "금액 (억원)", "원문 계정 / ID", "사용 필드 / 원문 금액"].map(s => <th key={s} className="p-2">{s}</th>)}</tr></thead><tbody>{(Object.keys(metricLabels) as Metric[]).map(key => <tr key={key} className="border-t border-white/5"><td className="p-2 whitespace-nowrap">{metricLabels[key]}</td><td className="p-2">{money(v?.[key])}</td><td className="p-2">{a.latest?.evidence[key]?.map((e, i) => <div key={i}>{e.statement} · {e.name}<span className="block text-[10px] text-zinc-600">{e.id}</span></div>)}</td><td className="p-2">{a.latest?.evidence[key]?.map((e, i) => <div key={i}>{e.field}<br />{e.raw || "결측"}</div>)}</td></tr>)}</tbody></table></div></details>
      <details><summary className="cursor-pointer text-zinc-200">확보한 전체 보고서와 공시 원문</summary><ul className="mt-2 grid gap-2 sm:grid-cols-2">{[...company.reports].reverse().map(r => <li key={r.periodEnd}><a className="text-cyan-300 underline" target="_blank" rel="noreferrer" href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.receipt}`}>{r.periodEnd} · {r.scope} · 공시 {r.filedAt} ↗</a> · {r.warnings.length}개 검증 참고</li>)}</ul></details>
      <p>공식 출처: <a className="text-cyan-300 underline" href="https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019020" target="_blank" rel="noreferrer">OpenDART 전체 재무제표</a> · <a className="text-cyan-300 underline" href="https://openapi.krx.co.kr/" target="_blank" rel="noreferrer">KRX Open API</a>. 단기금융상품의 환금성·사용제한과 주석만 제공되는 사항은 추가 확인이 필요합니다.</p>
    </div>}
  </section>;
}

function DisclosedAccounts({ report }: { report: FinancialCompany["reports"][number] | null }) {
  const [query, setQuery] = useState("");
  const [statement, setStatement] = useState("relevant");
  const rows = (report?.accounts ?? []).filter(a => (statement === "all" || (statement === "relevant" ? /현금|차입|사채|금융|예치|리스|배당|자기주식|매출채권|재고|자산|부채/.test(a.name) : a.statement === statement)) && `${a.name} ${a.id}`.toLowerCase().includes(query.toLowerCase()));
  return <details open className="border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm font-medium text-zinc-200">최신 재무제표 공시 계정 전체 보기</summary>{!report?.accounts?.length ? <p className="mt-3">공시 계정 상세가 아직 수집되지 않았습니다.</p> : <><p className="my-3">{report.periodEnd} · {report.scope === "CFS" ? "연결" : "별도"} · 재무상태표는 기말 잔액, 현금흐름표와 손익계산서는 누적액입니다. 원문 행을 그대로 표시하므로 합계와 하위 항목을 중복 합산하지 마세요.</p><div className="flex flex-wrap gap-2"><input className={inputClass} aria-label="공시 계정 검색" placeholder="계정명 또는 ID 검색" value={query} onChange={e => setQuery(e.target.value)} /><select className={inputClass} aria-label="공시 계정 구분" value={statement} onChange={e => setStatement(e.target.value)}><option value="relevant">현금·자산·부채 관련</option><option value="all">전체 계정</option><option value="BS">재무상태표</option><option value="CF">현금흐름표</option><option value="IS">손익계산서</option><option value="CIS">포괄손익계산서</option></select></div><div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-left text-xs"><caption className="py-2 text-left text-zinc-500">{rows.length}개 공시 계정 · 공시 원본 단위</caption><thead className="sticky top-0 bg-[#1c222b]"><tr><th className="p-2">구분</th><th className="p-2">계정명 / ID</th><th className="p-2 text-right">원문 금액</th><th className="p-2">통화</th></tr></thead><tbody>{rows.map((a, i) => <tr key={i} className="border-t border-white/5"><td className="p-2">{a.statement}</td><td className="p-2">{a.name}<span className="block text-[10px] text-zinc-600">{a.id}</span></td><td className="p-2 text-right tabular-nums">{a.amount || "—"}</td><td className="p-2">{a.currency || "미확인"}</td></tr>)}</tbody></table></div></>}</details>;
}

function Trend({ title, labels, series }: { title: string; labels: string[]; series: { name: string; color: string; values: (number | null)[] }[] }) {
  const values = series.flatMap(s => s.values.filter((v): v is number => v != null));
  const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
  const x = (i: number) => 62 + i * 450 / Math.max(1, labels.length - 1), y = (v: number) => 25 + (max - v) / span * 140;
  return <div><h3 className="text-sm font-medium">{title}</h3><div className="mt-2 flex flex-wrap gap-4 text-[11px]">{series.map(s => <span key={s.name} style={{ color: s.color }}>{s.name}</span>)}</div>{!values.length ? <p className="py-12 text-center text-xs text-zinc-500">확보한 데이터가 없습니다.</p> : <svg viewBox="0 0 550 210" className="mt-3 w-full" role="img" aria-label={title}><title>{title}</title>{[min, min + span / 2, max].map((v, i) => <g key={i}><line x1="62" x2="520" y1={y(v)} y2={y(v)} stroke="#ffffff12" /><text x="55" y={y(v) + 4} textAnchor="end" fill="#71717a" fontSize="10">{money(v)}</text></g>)}{labels.map((s, i) => <text key={`${s}-${i}`} x={x(i)} y="193" textAnchor="middle" fill="#71717a" fontSize="11">{s}</text>)}{series.map(s => <g key={s.name}>{s.values.map((v, i) => v == null ? null : <g key={i}>{i > 0 && s.values[i - 1] != null && <line x1={x(i - 1)} y1={y(s.values[i - 1]!)} x2={x(i)} y2={y(v)} stroke={s.color} strokeWidth="2" />}<circle cx={x(i)} cy={y(v)} r="3" fill={s.color}><title>{labels[i]} {s.name}: {money(v)}억원</title></circle></g>)}</g>)}</svg>}<CardHelp label={title} content={cardHelp[title]} alignRight={title === "연간 현금 창출력 · 억원"} /></div>;
}
