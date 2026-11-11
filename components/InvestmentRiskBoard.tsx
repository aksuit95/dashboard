"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { analyzeCompany } from "@/lib/financials/analyze";
import type { FinancialBoard } from "@/lib/financials/types";

type Alert = { schema_version: string; source: string; source_url: string; observed_at: string; alerts: Record<string, string[]>; securities?: Record<string, { name: string | null; market: string | null }> };
type Prices = { asOf: string; fetchedAt: string; closes: Record<string, number | null>; securities: Record<string, { name: string; market: string }> };
const tabs = ["관리", "거래정지", "투자주의", "투자경고", "투자위험", "재무 경고"] as const;
type Tab = typeof tabs[number];
const date = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

export function InvestmentRiskBoard() {
  const [tab, setTab] = useState<Tab>("관리"), [market, setMarket] = useState("전체"), [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState<Alert | null>(null), [financial, setFinancial] = useState<FinancialBoard | null>(null), [prices, setPrices] = useState<Prices | null>(null);
  const [status, setStatus] = useState({ alerts: "loading", financial: "loading", prices: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const load = async (url: string, key: "alerts" | "financial" | "prices", accept: (value: any) => void) => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const value = await response.json(); accept(value);
        if (!controller.signal.aborted) setStatus(s => ({ ...s, [key]: "ok" }));
      } catch { if (!controller.signal.aborted) setStatus(s => ({ ...s, [key]: "error" })); }
    };
    void load("/short-selling-data/live/market_alerts.json", "alerts", value => {
      if (!["market-alerts.v2"].includes(value.schema_version) || !value.alerts || !Number.isFinite(Date.parse(value.observed_at))) throw new Error();
      setAlerts(value);
    });
    void load("/api/financials", "financial", value => { if (!value.publication) throw new Error(); setFinancial(value); });
    void load("/api/investment-risk", "prices", value => { if (!value.prices) throw new Error(); setPrices(value.prices); });
    return () => controller.abort();
  }, []);
  const rows = useMemo(() => {
    const companies = new Map((financial?.publication?.companies ?? []).map(c => [c.code, c]));
    const codes = tab === "재무 경고" ? [...companies.keys()] : Object.keys(alerts?.alerts ?? {}).filter(code => alerts?.alerts[code]?.includes(tab));
    return codes.map(code => {
      const company = companies.get(code), analysis = company ? analyzeCompany(company) : null;
      const warnings = analysis?.signals.filter(s => s.severity === "warning") ?? [];
      return { code, name: alerts?.securities?.[code]?.name ?? prices?.securities?.[code]?.name ?? company?.name ?? null, market: alerts?.securities?.[code]?.market ?? prices?.securities?.[code]?.market ?? (company ? "KOSPI" : null), company, analysis, warnings, labels: alerts?.alerts[code] ?? [] };
    }).filter(row => (tab !== "재무 경고" || row.warnings.length > 0) && (market === "전체" || row.market === market) && `${row.code} ${row.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => (a.name ?? a.code).localeCompare(b.name ?? b.code, "ko"));
  }, [alerts, financial, prices, tab, market, query]);
  const selectedStatus = tab === "재무 경고" ? status.financial : status.alerts;
  return <section className="space-y-5" aria-label="투자위험 목록">
    <div className="rounded-xl border border-white/10 bg-[#121720] p-4 sm:p-5">
      <div role="tablist" aria-label="위험 분류" className="flex gap-5 overflow-x-auto border-b border-white/10 whitespace-nowrap">
        {tabs.map(item => <button role="tab" type="button" aria-selected={tab === item} key={item} onClick={() => setTab(item)} className={`border-b-2 pb-3 text-sm font-medium ${tab === item ? "border-rose-400 text-white" : "border-transparent text-zinc-400 hover:text-white"}`}>{item}</button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-white/15" aria-label="시장 필터">{[["전체", "전체"], ["KOSPI", "코스피"], ["KOSDAQ", "코스닥"]].map(([value, label]) => <button type="button" key={value} aria-pressed={market === value} onClick={() => setMarket(value)} className={`px-3 py-2 text-xs ${market === value ? "bg-white/15 text-white" : "text-zinc-400"}`}>{label}</button>)}</div>
        <input value={query} onChange={e => setQuery(e.target.value)} aria-label="종목명 또는 코드 검색" placeholder="종목명 또는 코드 검색" className="rounded-md border border-white/15 bg-[#0c1018] px-3 py-2 text-sm" />
        <span className="ml-auto text-xs text-zinc-400">{rows.length}개 종목</span>
      </div>
      <div className="mt-4 space-y-1 text-xs leading-5 text-zinc-400">
        <p>{alerts ? <>시장경보 조회 {date(alerts.observed_at)} KST · <a className="text-cyan-300 underline" href={alerts.source_url} target="_blank" rel="noreferrer">{alerts.source}</a></> : status.alerts === "error" ? "시장경보 자료를 확인할 수 없습니다." : "시장경보 자료를 불러오는 중입니다."}</p>
        <p>{prices ? `가격: ${prices.asOf} KRX 정규장 15:30 종가 · 수집 ${date(prices.fetchedAt)} KST` : status.prices === "error" ? "KRX 종가 자료를 확인할 수 없습니다." : "KRX 종가 자료를 불러오는 중입니다."}</p>
        <p>재무 신호는 현금·재무건전성의 코스피200 공시 자료만 연결하며, 기업별 재무 기준일이 다릅니다. 결측은 위험이 없다는 뜻이 아닙니다. 시장 미확인 종목은 전체에서만 표시됩니다.</p>
        {status.financial === "error" && <p className="text-amber-300">재무 자료를 확인할 수 없어 재무 신호를 표시할 수 없습니다.</p>}
      </div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-zinc-500"><tr><th className="p-3">종목명</th><th className="p-3">시장경보</th><th className="p-3 text-right">KRX 종가</th><th className="p-3">재무 위험 요인</th><th className="p-3">재무 기준일</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.code} className="border-b border-white/5 align-top"><td className="p-3"><span className="font-medium text-zinc-100">{row.name ?? "종목명 미확인"}</span><span className="mt-1 block text-xs text-zinc-500">{row.code} · {row.market === "KOSPI" ? "코스피" : row.market === "KOSDAQ" ? "코스닥" : "시장 미확인"}</span></td><td className="p-3"><div className="flex flex-wrap gap-1">{status.alerts !== "ok" ? <span className="text-zinc-500">자료 미확인</span> : row.labels.length ? row.labels.map(label => <span key={label} className="rounded bg-rose-400/10 px-2 py-1 text-xs text-rose-300">{label}</span>) : <span className="text-zinc-500">해당 없음</span>}</div></td><td className="p-3 text-right tabular-nums">{prices?.closes[row.code] != null ? `${prices.closes[row.code]!.toLocaleString("ko-KR")}원` : "—"}</td><td className="max-w-md p-3 text-xs leading-5">{row.company ? <>{row.warnings.length ? <ul className="space-y-1 text-amber-200">{row.warnings.map(s => <li key={s.text}>{s.text}</li>)}</ul> : <span className="text-zinc-500">{!row.analysis?.latest ? "공시 자료 미확보" : row.company.financial !== false ? "금융업·업종 미확인: 일반기업 평가 제외" : "표시된 경고 없음 · 자료 확인 필요"}</span>}<Link href={`/financials?code=${row.code}`} className="mt-2 inline-block text-cyan-300 hover:underline">재무 상세 보기 →</Link></> : <span className="text-zinc-500">{status.financial === "ok" ? "재무 분석 대상 외" : "재무 자료 미확인"}</span>}</td><td className="p-3 text-xs text-zinc-400">{row.analysis?.latest ? <>{row.analysis.latest.periodEnd}<br />{row.analysis.latest.scope === "CFS" ? "연결" : "별도"}</> : "—"}</td></tr>)}</tbody></table></div>
      {selectedStatus === "loading" && <p className="py-8 text-center text-sm text-zinc-400">자료를 불러오는 중입니다.</p>}
      {selectedStatus === "error" && <p role="status" className="py-8 text-center text-sm text-amber-300">선택한 목록을 불러오지 못했습니다.</p>}
      {selectedStatus === "ok" && !rows.length && <p className="py-8 text-center text-sm text-zinc-500">조건에 맞는 종목이 없습니다.</p>}
    </div>
  </section>;
}
