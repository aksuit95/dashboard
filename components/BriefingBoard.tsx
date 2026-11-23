"use client";
import { DataFreshness, krxCloseDetail, latestDataTime } from "@/components/DataFreshness";
import { useEffect, useMemo, useState } from "react";

type Period = { selected: string; start: string; end: string; base: string; days: string[]; weekEnd: string };
type Movers = { total: number; up: number; down: number; flat: number; missing: number; leaders: {code: string; name: string; sector: string; value: number}[]; laggards: {code: string; name: string; sector: string; value: number}[] };
type Report = { type: "daily" | "weekly"; period: Period; createdAt: string; indices: { id: string; close: number | null; change: number | null; percent: number | null; fetchedAt: string | null; error: string | null; values: {date: string; value: number | null}[] }[]; sectors: { universe: string; rows: {name: string; total: number; valid: number; value: number | null}[]; movers?: Movers; hasMissing?: boolean; fetchedAt: string | null; error: string | null }[]; flows: {universe: string; points: {date: string; individual: number | null; foreign: number | null; institution: number | null}[]; collectedAt: string | null; updatedAt: string | null; missing: string[]; error: string | null}[] };
const KEY = "market-briefing-snapshots-v1";
const num = (x: number | null, digits = 2) => x == null ? "결측" : x.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
function Signed({ value, digits = 2, suffix = "" }: { value: number | null; digits?: number; suffix?: string }) {
  const direction = value == null || value === 0 ? "neutral" : value > 0 ? "up" : "down";
  return <span className={`briefing-value briefing-value-${direction} tabular-nums`}>{value != null && value > 0 ? "+" : ""}{num(value, digits)}{value == null ? "" : suffix}</span>;
}
const stamp = (x: string | null) => x ? new Date(x).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) + " KST" : "확인 불가";
const market = (x: string) => x === "kospi" ? "코스피" : x === "kosdaq" ? "코스닥" : x === "kospi200" ? "코스피200" : "코스닥150";
const buttonBase = "rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-40";
const button = `${buttonBase} border-white/15 hover:bg-white/10`;
const panel = "rounded-xl border border-white/10 bg-white/[0.03] p-5";
const deleteButton = `${buttonBase} border-rose-400/30 text-rose-200 hover:bg-rose-400/10 focus-visible:outline-2 focus-visible:outline-rose-300`;

function savedReportKey(report: Report) {
  return `${report.type}:${report.period.end}:${report.createdAt}`;
}

function readSavedReports(): Report[] {
  const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  if (!Array.isArray(parsed)) throw new Error("Invalid briefing history");
  return parsed;
}

export function BriefingBoard() {
  const [type, setType] = useState<"daily" | "weekly">("daily");
  const [date, setDate] = useState("");
  const [weeklyDate, setWeeklyDate] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [automatic, setAutomatic] = useState<{id: string; report: Report}[]>([]);
  const [automaticError, setAutomaticError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const weeklyReports = useMemo(() => {
    const sorted = [...automatic.map(x => x.report), ...reports].filter(r => r.type === "weekly" && r.period?.end).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...new Map<string, Report>(sorted.map(r => [r.period.end, r] as const).reverse()).values()].sort((a, b) => b.period.end.localeCompare(a.period.end));
  }, [automatic, reports]);
  const selectedWeekly = weeklyReports.find(r => r.period.end === weeklyDate) ?? weeklyReports[0];
  useEffect(() => {
    setDate(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
    try { setReports(readSavedReports()); } catch { setError("저장된 브리핑 이력을 읽을 수 없습니다."); }
    fetch("/api/briefing/automatic", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setAutomatic(data.reports)).catch(() => setAutomaticError("자동 생성 이력을 읽지 못했습니다."));
  }, []);
  async function review() {
    if (type === "weekly") {
      if (!selectedWeekly) return;
      setError(""); setReport(selectedWeekly); setSaved(true);
      return;
    }
    setBusy(true); setError(""); setReport(null); setSaved(false);
    try {
      const response = await fetch(`/api/briefing?type=${type}&date=${date}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "자료를 확인하지 못했습니다.");
      setReport(data);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function save() {
    if (!report || report.indices.some(i => i.error)) return;
    try {
      const next = [{ ...report, createdAt: new Date().toISOString() }, ...readSavedReports()];
      localStorage.setItem(KEY, JSON.stringify(next));
      setReports(next); setReport(next[0]); setSaved(true); setError(""); setHistoryNotice(null);
    }
    catch { setError("브라우저에 저장하지 못했습니다. 저장 공간 및 브라우저 설정을 확인하세요."); }
  }
  function deleteSavedReport(key: string) {
    try {
      const next = readSavedReports().filter(entry => savedReportKey(entry) !== key);
      localStorage.setItem(KEY, JSON.stringify(next));
      setReports(next);
      if (report && saved && savedReportKey(report) === key) {
        setReport(null);
        setSaved(false);
      }
      setDeleteTarget(null);
      setHistoryNotice({ text: "브리핑을 삭제했습니다." });
    } catch {
      setHistoryNotice({ text: "브라우저에 저장한 브리핑을 삭제하지 못했습니다.", error: true });
    }
  }
  const freshnessReport = report ?? (type === "weekly" ? selectedWeekly : [...automatic.map(entry => entry.report), ...reports]
    .filter(entry => entry.type === "daily").sort((a, b) => b.period.end.localeCompare(a.period.end) || b.createdAt.localeCompare(a.createdAt))[0]);
  const updatedAt = freshnessReport ? latestDataTime([
    ...freshnessReport.indices.map(item => item.fetchedAt),
    ...freshnessReport.sectors.map(item => item.fetchedAt),
    ...freshnessReport.flows.map(item => item.collectedAt),
  ]) : null;
  return <section>
    <div className="briefing-controls space-y-5">
      <DataFreshness basis={freshnessReport?.period.end} basisDetail={`${report ? "선택 브리핑 · " : ""}${krxCloseDetail(freshnessReport?.period.end)}`}
        updatedAt={updatedAt} updateDetail="브리핑 원자료 수집" />
      <div className={panel}>
        <div className="flex flex-wrap items-end gap-4"><div><label htmlFor="brief-type" className="mb-2 block text-xs text-zinc-400">브리핑 종류</label><select id="brief-type" value={type} onChange={e => { setType(e.target.value as typeof type); setReport(null); setError(""); }} className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2"><option value="daily">일간</option><option value="weekly">주간</option></select></div><div><label htmlFor="brief-date" className="mb-2 block text-xs text-zinc-400">{type === "weekly" ? "생성된 주간 브리핑" : "선택 날짜"}</label>{type === "weekly" ? <select id="brief-date" value={selectedWeekly?.period.end ?? ""} onChange={e => { setWeeklyDate(e.target.value); setReport(null); setError(""); }} disabled={!weeklyReports.length} className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 disabled:opacity-50">{weeklyReports.length ? weeklyReports.map(r => <option key={r.period.end} value={r.period.end}>{r.period.end} 마감 · {r.period.start} ~ {r.period.end}</option>) : <option value="">생성된 주간 브리핑 없음</option>}</select> : <input id="brief-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2" />}</div><button type="button" onClick={review} disabled={busy || (type === "weekly" ? !selectedWeekly : !date)} className="rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-40">{busy ? "자료 확인 중…" : type === "weekly" ? "주간 브리핑 보기" : "자료 확인 · 미리보기"}</button></div>
        <p className="mt-4 text-sm text-zinc-400">{type === "weekly" ? "생성되어 보관된 주간 브리핑의 마지막 거래일만 선택할 수 있습니다." : "일간은 선택일의 직전 완료 거래일을 기준으로 합니다."} KRX 정규장 종가 기준입니다(통상 15:30, 2026-11-19은 16:30).</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">자동 생성된 브리핑은 공유 이력에서 확인할 수 있습니다. 직접 저장한 브리핑은 이 브라우저에만 보관됩니다.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p>}
      {report && <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={report.indices.some(i => !!i.error) || saved} className={button}>{saved ? "이력에 저장됨" : "브리핑 이력에 저장"}</button><button type="button" onClick={() => window.print()} disabled={report.indices.some(i => !!i.error)} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-40">PDF로 저장 / 인쇄</button><span className="text-xs text-zinc-400">{report.indices.some(i => i.error) ? "필수 지수 자료가 없어 저장과 PDF 생성을 막았습니다." : "인쇄 창에서 PDF 저장을 선택하세요."}</span></div>}
    </div>
    {report && <article className="briefing-report mt-5 space-y-5 rounded-2xl border border-white/10 bg-[#111923] p-4 shadow-xl shadow-black/10 md:p-6">
      <header className="briefing-header rounded-xl border border-emerald-300/10 bg-gradient-to-r from-emerald-400/[0.08] to-transparent px-4 py-4"><p className="text-xs font-bold tracking-widest text-emerald-400">MK RESEARCH · MARKET BRIEFING</p><h2 className="mt-2 text-2xl font-bold">{report.type === "daily" ? "일간" : "주간"} 시장 브리핑</h2><p className="mt-2 text-sm text-zinc-400">{report.type === "weekly" ? `대상 주간 ${report.period.start} ~ ${report.period.weekEnd} · 실제 거래일 ${report.period.days[0]} ~ ${report.period.end}` : `선택일 ${report.period.selected} · 실제 기준일 ${report.period.end}`}<br />KRX 정규장 {report.period.end === "2026-11-19" ? "16:30" : "15:30"} KST · 비교 기준일 {report.period.base} · 작성 {stamp(report.createdAt)}</p></header>
      <section><h3 className="briefing-section-title text-lg font-bold">01 시장 요약</h3><p className="mt-1 text-xs text-zinc-400">출처: KRX 정보데이터시스템 · 기준일 및 비교일 모두 KRX 정규장 종가</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{report.indices.map(i => <div key={i.id} className="briefing-card rounded-xl border border-white/[0.09] bg-white/[0.035] p-3"><p className="text-sm text-zinc-400">{market(i.id)}</p>{i.error ? <p className="mt-2 text-sm text-rose-300">결측 · {i.error}</p> : <><p className="mt-1 text-2xl font-bold">{num(i.close)}</p><p className="mt-1 text-sm font-semibold"><Signed value={i.change} /> <span className="text-zinc-500">(</span><Signed value={i.percent} suffix="%" /><span className="text-zinc-500">)</span></p><p className="mt-1 text-xs text-zinc-500">수집 {stamp(i.fetchedAt)}</p></>}</div>)}</div>{report.type === "weekly" && <table className="mt-4 w-full text-left text-sm"><thead><tr><th>거래일</th><th>코스피</th><th>코스닥</th></tr></thead><tbody>{report.period.days.map(d => <tr key={d}><td>{d}</td>{report.indices.map(i => <td key={i.id}>{num(i.values.find(v => v.date === d)?.value ?? null)}</td>)}</tr>)}</tbody></table>}</section>
      <section><h3 className="briefing-section-title text-lg font-bold">02 섹터 흐름</h3><p className="mt-0.5 text-xs text-zinc-400">구성종목 동일가중 평균 · 공식 섹터 지수가 아니며 현재 구성과 분류를 과거에 적용합니다.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{report.sectors.map(s => <div key={s.universe} className="briefing-card rounded-xl border border-white/[0.09] bg-white/[0.035] p-3"><h4 className="font-semibold">{market(s.universe)}</h4>{s.error ? <p className="mt-1 text-sm">결측 · {s.error}</p> : <><div className="mt-1 grid grid-cols-2 gap-x-4">{([["상위 3", s.rows.slice(0, 3)], ["하위 3", s.rows.slice(-3).reverse()]] as const).map(([label, rows]) => <div key={label}><p className="mb-1 text-xs text-zinc-400">{label}</p>{rows.map(r => <div key={r.name} className="flex justify-between gap-2 py-0.5 text-sm leading-tight"><span>{r.name}</span><span className="whitespace-nowrap font-semibold"><Signed value={r.value} suffix="%" /></span></div>)}</div>)}</div>{(s.hasMissing || s.rows.some(r => r.valid < r.total)) && <p className="mt-1 text-xs text-amber-300">일부 구성종목 가격 결측</p>}<p className="mt-1 text-xs text-zinc-500">기준 {report.period.end} · 수집 {stamp(s.fetchedAt)}</p></>}</div>)}</div></section>
      <section><h3 className="briefing-section-title text-lg font-bold">03 상승·하락 종목</h3><p className="mt-0.5 text-xs text-zinc-400">코스피200·코스닥150 구성종목 기준 · {report.type === "daily" ? "전 거래일" : "주간 첫 거래일의 직전 거래일"} 대비 KRX 종가 · 현재 구성 적용</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{report.sectors.map(s => <div key={s.universe} className="briefing-card rounded-xl border border-white/[0.09] bg-white/[0.035] p-3"><h4 className="font-semibold">{market(s.universe)}</h4>{!s.movers ? <p className="mt-1 text-sm">{s.error ? `결측 · ${s.error}` : "이전 저장본에는 이 항목이 없습니다. 새로 자료를 확인해 주세요."}</p> : <><p className="mt-1 text-sm"><span className="briefing-value-up font-semibold">상승 {s.movers.up}</span> · <span className="briefing-value-down font-semibold">하락 {s.movers.down}</span> · 보합 {s.movers.flat} · 결측 {s.movers.missing} <span className="text-zinc-500">/ 전체 {s.movers.total}종목</span></p><div className="mt-2 grid grid-cols-2 gap-x-4">{([["상승 상위", s.movers.leaders], ["하락 상위", s.movers.laggards]] as const).map(([label, rows]) => <div key={label}><p className="mb-1 text-xs text-zinc-400">{label}</p>{rows.length ? rows.map(r => <div key={r.code} className="py-0.5 text-sm leading-tight"><div className="flex justify-between gap-2"><span>{r.name}</span><span className="whitespace-nowrap font-semibold"><Signed value={r.value} suffix="%" /></span></div><p className="text-xs text-zinc-500">{r.code} · {r.sector}</p></div>) : <p className="text-sm text-zinc-500">해당 종목 없음</p>}</div>)}</div><p className="mt-1 text-xs text-zinc-500">기준 {report.period.end} · 수집 {stamp(s.fetchedAt)}</p></>}</div>)}</div></section>
      <section><h3 className="briefing-section-title text-lg font-bold">04 투자자 수급</h3><p className="mt-0.5 text-xs text-zinc-400">출처: 토스증권 · 단위 억 원 · 매수 − 매도. 수급은 KRX·NXT 합산으로 KRX 종가와 거래 범위가 다릅니다.</p>{report.flows.map(f => <div key={f.universe} className="briefing-card mt-2 rounded-xl border border-white/[0.09] bg-white/[0.035] p-3"><h4 className="font-semibold">{f.universe === "kospi200" ? "코스피 시장" : "코스닥 시장"}</h4>{f.points.length > 0 && <div className="overflow-x-auto"><table className="briefing-flow-table mt-1 w-full text-left text-sm"><thead><tr><th>거래일</th><th>개인</th><th>외국인</th><th>기관</th></tr></thead><tbody>{f.points.map(p => <tr key={p.date}><td>{p.date}</td>{([p.individual,p.foreign,p.institution]).map((v,i) => <td key={i}><Signed value={v === null ? null : v / 100000000} digits={0} /></td>)}</tr>)}{report.type === "weekly" && <tr><th>주간 합계</th>{(["individual","foreign","institution"] as const).map(k => <td key={k}>{f.missing.length ? "결측" : <Signed value={f.points.reduce((sum,p) => sum + (p[k] ?? 0), 0) / 100000000} digits={0} />}</td>)}</tr>}</tbody></table></div>}{f.error && <p className="mt-2 text-sm">{f.error} {f.missing.join(", ")}</p>}<p className="mt-1 text-xs text-zinc-500">원본 갱신 {stamp(f.updatedAt)} · 수집 {stamp(f.collectedAt)}</p></div>)}</section>
      <p className="border-t border-white/10 pt-4 text-xs text-zinc-500">정보 제공 및 개인 리서치용입니다. 투자 권유나 매매 신호가 아닙니다.</p>
    </article>}
    <div className={`${panel} briefing-controls mt-6`}><h2 className="font-bold">생성된 브리핑</h2><p className="mt-1 text-xs text-zinc-500">공유 저장소와 이 PC의 생성 결과 · 이력 갱신은 화면 새로고침</p>{automaticError ? <p role="alert" className="mt-3 text-sm text-rose-300">{automaticError}</p> : automatic.length === 0 ? <p className="mt-3 text-sm text-zinc-500">생성된 브리핑이 없습니다.</p> : <ul className="mt-2 divide-y divide-white/10">{automatic.map(({id, report: r}) => <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{r.type === "daily" ? "일간" : "주간"} · {r.type === "weekly" ? `${r.period.start} ~ ${r.period.end}` : r.period.end} <span className="text-zinc-500">· {stamp(r.createdAt)} · {r.sectors.some(s => s.error || s.hasMissing) || r.flows.some(f => f.error) ? "일부 결측" : "자료 준비"}</span></span><span className="flex gap-2"><button type="button" className={button} onClick={() => { setReport(r); setSaved(true); setError(""); window.scrollTo({top: 0, behavior: "smooth"}); }}>보기</button><a className={button} href={`/api/briefing/automatic/pdf?id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">PDF</a></span></li>)}</ul>}</div>
    <section className={`${panel} briefing-controls mt-6`} aria-labelledby="saved-briefings">
      <h2 id="saved-briefings" className="font-bold">브라우저에 저장한 브리핑</h2>
      {historyNotice && <p role={historyNotice.error ? "alert" : "status"} className={`mt-3 text-sm ${historyNotice.error ? "text-rose-300" : "text-emerald-200"}`}>{historyNotice.text}</p>}
      {reports.length === 0 ? <p className="mt-3 text-sm text-zinc-500">이 브라우저에 저장된 브리핑이 없습니다.</p> : (
        <ul className="mt-3 divide-y divide-white/10">
          {reports.map(r => {
            const key = savedReportKey(r);
            const period = r.type === "weekly" ? `${r.period.start} ~ ${r.period.weekEnd}` : r.period.end;
            const label = `${r.type === "daily" ? "일간" : "주간"} · ${period}`;
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span>{label} <span className="text-zinc-500">· {stamp(r.createdAt)} · {r.sectors.some(s => s.error) || r.flows.some(f => f.error) ? "일부 결측" : "자료 준비"}</span></span>
                {deleteTarget === key ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-400">이 브라우저의 저장본을 삭제할까요?</span>
                    <button type="button" className={button} onClick={() => { setDeleteTarget(null); setHistoryNotice(null); }}>취소</button>
                    <button type="button" className={deleteButton} onClick={() => deleteSavedReport(key)}>삭제 확인</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" className={button} onClick={() => { setReport(r); setSaved(true); setError(""); window.scrollTo({top: 0, behavior: "smooth"}); }}>보기</button>
                    <button type="button" className={deleteButton} aria-label={`${label} 저장본 삭제`} onClick={() => { setDeleteTarget(key); setHistoryNotice(null); }}>삭제</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  </section>;
}
