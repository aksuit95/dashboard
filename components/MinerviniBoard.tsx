"use client";

import { Fragment, useEffect, useState } from "react";
import { MinerviniGuide } from "@/components/MinerviniGuide";
import type { MinerviniBoard as Board } from "@/lib/sources/minervini-daily";
import type { MinerviniRow, MinerviniStatus } from "@/lib/market/minervini";
import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";

const labels: Record<MinerviniStatus, string> = { excluded: "대상 제외", trend: "추세 미충족", rs: "RS 미충족", watch: "패턴 관찰", ready: "돌파 대기", breakout: "거래량 돌파", extended: "추격 주의" };
const colors: Record<MinerviniStatus, string> = { excluded: "text-zinc-500", trend: "text-zinc-400", rs: "text-zinc-400", watch: "text-sky-300", ready: "text-amber-300", breakout: "text-emerald-300", extended: "text-rose-300" };
type Filter = "candidates" | "trend" | "vcp" | "breakout" | "extended" | "all";
const filters: { id: Filter; label: string }[] = [ { id: "candidates", label: "RS 통과" }, { id: "trend", label: "추세 통과" }, { id: "vcp", label: "VCP 셋업" }, { id: "breakout", label: "거래량 돌파" }, { id: "extended", label: "추격 주의" }, { id: "all", label: "전체 종목" } ];
const number = (n: number | null) => n == null ? "—" : Math.round(n).toLocaleString("ko-KR");
const percent = (n: number | null) => n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const ratio = (n: number | null) => n == null ? "—" : `${n.toFixed(2)}배`;
const passedTrend = (r: MinerviniRow) => r.status !== "excluded" && r.checks.length === 8 && r.checks.slice(0, 7).every(c => c.pass);
const passedRs = (r: MinerviniRow) => passedTrend(r) && r.checks[7].pass;
function matches(r: MinerviniRow, filter: Filter) {
  if (filter === "candidates") return passedRs(r);
  if (filter === "trend") return passedTrend(r);
  if (filter === "vcp") return r.status === "ready" || r.status === "breakout";
  if (filter === "all") return true;
  return r.status === filter;
}

export function MinerviniBoard({ universe = "kospi200" }: { universe?: MinerviniUniverse }) {
  const spec = minerviniUniverses[universe];
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<Filter>("candidates");
  const [query, setQuery] = useState("");
  const [minRs, setMinRs] = useState(70);
  const [sort, setSort] = useState("rs");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true);
      try {
        const response = await fetch(`/api/minervini?universe=${universe}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as Board;
        if (!("snapshot" in data)) throw new Error();
        if (!controller.signal.aborted) {
          setBoard(previous => data.snapshot ? data : previous?.snapshot ? { ...previous, stale: true, error: data.error } : data);
          setError(data.error);
        }
      } catch { if (!controller.signal.aborted) setError("결과를 불러오지 못했습니다. 마지막 표시값을 유지합니다."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    // Check the daily cache on visibility and after 16:00, with retry on collection failure.
    // These requests never force a second successful scan for the same session.
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [reload, universe]);

  const snapshot = board?.snapshot;
  const rows = snapshot?.rows ?? [];
  const visible = rows.filter(r => matches(r, filter) && (filter === "all" || filter === "trend" || (r.rs ?? -1) >= minRs) && `${r.name} ${r.code}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === "pivot" ? Math.abs(a.pivotGap ?? Infinity) - Math.abs(b.pivotGap ?? Infinity) : sort === "volume" ? (b.volumeRatio ?? -1) - (a.volumeRatio ?? -1) : (b.rs ?? -1) - (a.rs ?? -1));
  const stages = [
    { label: "분석 유니버스", count: rows.length, note: `${spec.name} 현재 구성`, filter: "all" as Filter },
    { label: "01 추세 통과", count: rows.filter(passedTrend).length, note: "가격 조건 7개 충족", filter: "trend" as Filter },
    { label: "02 RS 통과", count: rows.filter(passedRs).length, note: "추세 + RS ≥ 70", filter: "candidates" as Filter },
    { label: "03 VCP 셋업", count: rows.filter(r => r.status === "ready" || r.status === "breakout").length, note: "수축·거래량 감소·피벗 ±5%", filter: "vcp" as Filter },
    { label: "04 거래량 돌파", count: rows.filter(r => r.status === "breakout").length, note: "종가 돌파 + 거래량 ≥ 1.5배", filter: "breakout" as Filter },
  ];
  return <section aria-label={`${spec.name} 미너비니 스크리너`}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
      <div className="space-y-1">
        <p><span className="mr-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">{spec.label}</span>매일 16:00 KST · 완료된 정규장 일봉 기준</p>
        <p className="pt-1">분석 기준일 {snapshot?.asOf ?? "—"} · 수집 {snapshot ? new Date(snapshot.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "—"} · RS 산정 {snapshot?.rankedSize ?? 0}/{snapshot?.universeSize ?? 0}종목</p>
      </div>
      <button type="button" disabled={busy} onClick={() => setReload(n => n + 1)} className="rounded-md border border-white/15 px-3 py-2 disabled:opacity-40">{busy ? "불러오는 중…" : "결과 새로고침"}</button>
    </div>
    {error || board?.stale ? <p role="status" className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">{snapshot ? `이전 결과 표시 중 (${snapshot.asOf}). ` : "분석 결과를 아직 수집하지 못했습니다. "}{error ?? board?.error} · 실패 시 재시도합니다.</p> : null}
    <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-5">
      {stages.map(s => <button type="button" key={s.label} onClick={() => setFilter(s.filter)} className="rounded-xl border border-white/10 bg-[#151a22] p-3 text-left hover:border-white/25">
        <p className="text-xs text-zinc-400">{s.label}</p><p className="my-2 text-3xl font-semibold tabular-nums">{snapshot ? s.count : "—"}<span className="ml-1 text-xs font-normal text-zinc-500">종목</span></p><p className="text-[11px] text-zinc-500">{s.note}</p>
      </button>)}
    </div>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {filters.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); setSelected(null); }} className={`rounded-md px-3 py-2 text-xs ${filter === f.id ? "bg-rose-950 text-rose-100" : "bg-white/5 text-zinc-400"}`}>{f.label} <span className="ml-1 opacity-60">{rows.filter(r => matches(r, f.id)).length}</span></button>)}
    </div>
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
      <input aria-label="종목명 또는 코드 검색" placeholder="종목명 / 코드 검색" value={query} onChange={e => setQuery(e.target.value)} className="rounded-md border border-white/10 bg-[#151a22] px-3 py-2" />
      <label className="text-zinc-400">RS 하한 <select value={minRs} onChange={e => setMinRs(+e.target.value)} disabled={filter === "all" || filter === "trend"} className="ml-1 rounded bg-[#151a22] p-2 disabled:opacity-40"><option value={70}>70</option><option value={80}>80</option><option value={90}>90</option></select></label>
      <label className="text-zinc-400">정렬 <select value={sort} onChange={e => setSort(e.target.value)} className="ml-1 rounded bg-[#151a22] p-2"><option value="rs">RS 높은 순</option><option value="pivot">피벗 가까운 순</option><option value="volume">거래량 배수 순</option></select></label>
      <span className="text-zinc-500">{visible.length}개 · 종목을 누르면 조건 상세</span>
    </div>
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full whitespace-nowrap text-right text-xs tabular-nums">
        <thead className="bg-white/5 text-zinc-400"><tr>{["종목", "종가", "RS", "추세", "상태", "피벗", "피벗 대비", "거래량/50일", "손절 참고가", "피벗→손절"].map(h => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{visible.map(r => <Fragment key={r.code}>
          <tr className="border-t border-white/10 hover:bg-white/[0.025]">
            <td className="px-3 py-3 text-left"><button type="button" aria-expanded={selected === r.code} onClick={() => setSelected(selected === r.code ? null : r.code)} className="text-left"><span className="block font-medium text-zinc-100">{r.name}</span><span className="text-[10px] text-zinc-500">{r.code} {selected === r.code ? "▴" : "▾"}</span></button></td>
            <td className="px-3 py-3">{number(r.price)}</td><td className={`px-3 py-3 font-semibold ${(r.rs ?? 0) >= 90 ? "text-emerald-300" : "text-zinc-200"}`}>{r.rs?.toFixed(1) ?? "—"}</td>
            <td className="px-3 py-3">{r.checks.length ? `${r.checks.filter(c => c.pass).length}/8` : "—"}</td><td className={`px-3 py-3 ${colors[r.status]}`}>{labels[r.status]}</td><td className="px-3 py-3">{number(r.pivot)}</td><td className="px-3 py-3">{percent(r.pivotGap)}</td><td className="px-3 py-3">{ratio(r.volumeRatio)}</td><td className="px-3 py-3">{number(r.stop)}</td><td className="px-3 py-3 text-zinc-300">{r.pivotRisk == null ? "—" : `${r.pivotRisk.toFixed(1)}%`}</td>
          </tr>
          {selected === r.code ? <tr className="border-t border-white/10 bg-[#151a22]"><td colSpan={10} className="whitespace-normal p-4 text-left"><RowDetails row={r} /></td></tr> : null}
        </Fragment>)}</tbody>
      </table>
      {!visible.length ? <div className="px-4 py-12 text-center text-sm text-zinc-500">{busy && !snapshot ? `${spec.name} 일봉을 분석하고 있습니다. 첫 수집은 수십 초가 걸릴 수 있습니다.` : !snapshot ? "수집된 분석 결과가 없습니다." : "선택한 조건을 충족하는 종목이 없습니다. 전체 종목에서 제외 이유를 확인할 수 있습니다."}</div> : null}
    </div>
    <MinerviniGuide universe={universe} />
  </section>;
}

function RowDetails({ row: r }: { row: MinerviniRow }) {
  return <div className="grid gap-5 md:grid-cols-2">
    <div><p className="mb-2 font-medium text-zinc-200">Trend Template</p><ul className="grid gap-1">{r.checks.map(c => <li key={c.label} className={c.pass ? "text-emerald-300" : "text-zinc-500"}>{c.pass ? "✓" : "×"} {c.label}</li>)}</ul>{r.reasons.map(reason => <p key={reason} className="mt-2 text-amber-300">제외: {reason}</p>)}</div>
    <div className="space-y-2 text-zinc-400">
      <p>20 / 50 / 150 / 200일선: {number(r.ma20)} / {number(r.ma50)} / {number(r.ma150)} / {number(r.ma200)}</p>
      <p>200일선 105거래일 연속 상승: {r.longUptrend ? "충족" : "미충족·이력 부족"} · 20일선 위: {r.price != null && r.ma20 != null ? r.price > r.ma20 ? "예" : "아니오" : "—"}</p>
      <p>52주 저점 대비 {percent(r.aboveLow)} · 고점 대비 {percent(r.belowHigh)}</p>
      <p>3구간 고저폭: {r.contractions.length ? r.contractions.map(n => `${n.toFixed(1)}%`).join(" → ") : "—"} · VCP 근사 {r.vcp ? "충족" : "미충족"}</p>
      <p>일중 변동폭 최근10일/직전10일: {ratio(r.rangeRatio)} · 거래량 최근10일/50일: {ratio(r.dryUp)}</p>
      <p>20일 평균 거래대금 근사: {r.turnover == null ? "—" : `${(r.turnover / 1e8).toFixed(1)}억원`} · 시총: {(r.marketCap / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}억원</p>
      <p className={r.risk != null && r.risk > 8 ? "text-rose-300" : ""}>종가→손절 거리: {r.risk != null ? `${r.risk.toFixed(1)}%` : r.stop != null && r.price != null && r.price <= r.stop ? "— (종가가 손절 참고가 이하)" : "—"} · 종가 기준 2R 참고가: {number(r.target)}원 {r.risk != null && r.risk > 8 ? "· 손절 거리 8% 초과" : ""}</p>
      <a href={`https://stock.naver.com/domestic/stock/${r.code}/chart`} target="_blank" rel="noreferrer" className="inline-block text-sky-300 underline">종목 차트 확인 ↗</a>
    </div>
  </div>;
}
