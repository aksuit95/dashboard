"use client";

import { useEffect, useMemo, useState } from "react";
import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";
import type { Sector } from "@/config/sectors";
import { returnPeriods, summarizeSectors, type ReturnPeriod } from "@/lib/market/sector-returns";
import type { SectorBoard } from "@/lib/sources/sector-returns-daily";
import { nextSectorRefreshAt } from "@/lib/market/sector-refresh";

const percent = (v: number | null) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const color = (v: number | null) => v == null || v === 0 ? "text-zinc-400" : v > 0 ? "text-rose-400" : "text-sky-400";
const heat = (v: number | null) => v == null || v === 0 ? undefined : { backgroundColor: `rgba(${v > 0 ? "244,63,94" : "56,189,248"},${Math.min(0.25, 0.035 + Math.abs(v) / 180)})` };

export function SectorReturnsBoard() {
  const [universe, setUniverse] = useState<MinerviniUniverse>("kospi200");
  const [boards, setBoards] = useState<Record<string, SectorBoard>>({});
  const [date, setDate] = useState("");
  const [dateRange, setDateRange] = useState<{ latestDate: string; earliestDate: string } | null>(null);
  const boardKey = `${universe}:${date || "latest"}`;
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [period, setPeriod] = useState<ReturnPeriod>("1d");
  const [selected, setSelected] = useState<Sector | null>(null);
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/valuation/sectors?universe=${universe}${date ? `&date=${date}` : ""}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          const failure = await response.json() as { error?: string };
          throw new Error(failure.error ?? "등락률을 불러오지 못했습니다. 다시 시도해 주세요.");
        }
        const data = await response.json() as SectorBoard;
        if (!("snapshot" in data) || (data.snapshot && data.snapshot.universe !== universe)) throw new Error("지수 데이터 응답을 확인할 수 없습니다.");
        if (!controller.signal.aborted) {
          setBoards(previous => ({ ...previous, [boardKey]: data.snapshot ? data : previous[boardKey]?.snapshot ? { ...previous[boardKey], stale: true, error: data.error } : data }));
          if (data.latestDate && data.earliestDate) setDateRange({ latestDate: data.latestDate, earliestDate: data.earliestDate });
          setError(data.error);
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "수집 실패"); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [universe, date, boardKey, reload]);

  useEffect(() => {
    if (date) return; // Historical results stay static until the user changes the selection.
    let next = nextSectorRefreshAt();
    let timer: number | undefined;
    const refreshIfDue = () => {
      if (document.hidden || !next || Date.now() < next.getTime()) return;
      setReload(value => value + 1);
      next = nextSectorRefreshAt();
      arm();
    };
    const arm = () => {
      window.clearTimeout(timer);
      if (next) timer = window.setTimeout(refreshIfDue, Math.max(0, next.getTime() - Date.now()));
    };
    arm();
    // A sleeping/background tab catches up once only if the 16:00 boundary has passed.
    document.addEventListener("visibilitychange", refreshIfDue);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", refreshIfDue); };
  }, [date]);

  const board = boards[boardKey];
  const snapshot = board?.snapshot?.priceBasis === "KRX_REGULAR_CLOSE" ? board.snapshot : undefined;
  const rows = useMemo(() => snapshot?.rows ?? [], [snapshot]);
  const summaries = useMemo(() => summarizeSectors(rows), [rows]);
  const ranked = [...summaries].sort((a, b) => compare(a.returns[period], b.returns[period], true));
  const visible = rows.filter(r => (!selected || r.sector === selected) && `${r.name} ${r.code}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => compare(a.returns[period], b.returns[period], descending) || a.name.localeCompare(b.name, "ko"));
  const values = rows.flatMap(r => r.returns[period] == null ? [] : [r.returns[period]!]);
  const average = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const leader = ranked.find(s => s.returns[period] != null);
  const periodLabel = returnPeriods.find(p => p.id === period)!.label;
  const dates = dateRange ? Array.from({ length: 30 }, (_, i) => new Date(Date.parse(`${dateRange.latestDate}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10)).filter(d => d >= dateRange.earliestDate) : [];
  const dateLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;
  function sortBy(id: ReturnPeriod) {
    if (period === id) setDescending(d => !d);
    else { setPeriod(id); setDescending(true); }
  }

  return <section aria-label="섹터별 등락률 분석">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg border border-white/10 bg-[#151a22] p-1" aria-label="지수 선택">
        {(Object.keys(minerviniUniverses) as MinerviniUniverse[]).map(id => <button key={id} type="button" aria-pressed={universe === id} onClick={() => { setUniverse(id); setSelected(null); setQuery(""); setError(null); }} className={`rounded-md px-4 py-2 text-sm font-medium ${universe === id ? "bg-rose-950 text-rose-100" : "text-zinc-400 hover:text-white"}`}>{minerviniUniverses[id].name}</button>)}
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs text-zinc-400">날짜별 보기
          <select aria-label="기준 날짜 선택" disabled={!dateRange} value={date} onChange={e => { setDate(e.target.value); setPeriod("1d"); setDescending(true); setError(null); }} className="rounded-md border border-white/15 bg-[#151a22] px-3 py-2 text-zinc-100 disabled:opacity-40">
            <option value="">{dateRange ? `${dateLabel(dateRange.latestDate)} ${periodLabel} · 최신` : "날짜 불러오는 중…"}</option>
            {dates.filter(d => d !== dateRange?.latestDate).map(d => <option key={d} value={d}>{dateLabel(d)} {periodLabel}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => setReload(n => n + 1)} className="rounded-md border border-white/15 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40">{busy ? "불러오는 중…" : "결과 새로고침"}</button>
      </div>
    </div>
    {snapshot && board?.requestedDate && board.requestedDate !== snapshot.asOf && <p role="status" className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-zinc-400">선택일 {board.requestedDate}은 휴장일입니다. 직전 거래일 {snapshot.asOf}의 KRX 종가 기준 결과를 표시합니다.</p>}
    {date && <p className="mb-4 text-xs text-zinc-500">과거 가격 비교 · 구성종목과 섹터는 수집 시점 기준이며 과거 편입·편출을 재현하지 않습니다.</p>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
      <p>기준일 <span className="text-zinc-300">{snapshot?.asOf ?? "—"}</span> · KRX 15:30 종가 · 거래일 16:00 KST 하루 1회 갱신</p>
      <p>수집 {snapshot ? new Date(snapshot.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "—"} KST</p>
    </div>
    {(error || board?.stale) && <p role="status" className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">{snapshot ? `${snapshot.asOf} 이전 결과 표시 중. ` : "수집된 결과가 없습니다. "}{error ?? board?.error}</p>}
    <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="비교 기간">
      {returnPeriods.map(p => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => { setPeriod(p.id); setDescending(true); }} className={`min-w-14 rounded-md px-3 py-2 text-xs ${period === p.id ? "bg-zinc-100 font-semibold text-zinc-950" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>{p.label}</button>)}
      <span className="ml-2 text-xs text-zinc-500">섹터·종목 모두 선택 기간으로 정렬</span>
    </div>
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="구성종목" value={snapshot ? `${rows.length}종목` : "—"} note={minerviniUniverses[universe].label} />
      <Metric label={`${periodLabel} 평균 등락률`} value={percent(average)} tone={color(average)} note={`동일가중 · ${values.length}/${rows.length}종목 산정`} />
      <Metric label="상승 / 하락" value={values.length ? `${values.filter(v => v > 0).length} / ${values.filter(v => v < 0).length}` : "—"} note={`보합 ${values.filter(v => v === 0).length} · 미산정 ${rows.length - values.length}`} />
      <Metric label={`${periodLabel} 선도 섹터`} value={leader?.sector ?? "—"} tone={color(leader?.returns[period] ?? null)} note={leader ? percent(leader.returns[period]) : "데이터 대기"} />
    </div>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">섹터별 흐름 <span className="ml-2 text-xs font-normal text-zinc-500">{periodLabel} · 단순평균</span></h2><button type="button" aria-pressed={selected === null} onClick={() => setSelected(null)} className={`rounded-md px-3 py-1.5 text-xs ${selected === null ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5"}`}>전체 종목</button></div>
    <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {ranked.map(s => <button key={s.sector} type="button" aria-pressed={selected === s.sector} onClick={() => setSelected(selected === s.sector ? null : s.sector)} style={heat(s.returns[period])} className={`rounded-lg border p-3 text-left transition-colors ${selected === s.sector ? "border-zinc-200 ring-1 ring-zinc-200/20" : "border-white/10 hover:border-white/30"}`}>
        <p className="text-xs font-medium text-zinc-200">{s.sector}</p><p className={`mt-3 text-xl font-semibold tabular-nums ${color(s.returns[period])}`}>{percent(s.returns[period])}</p><p className="mt-1 text-[11px] text-zinc-500">{s.count}종목 · 산정 {s.coverage[period]}/{s.count}</p>
      </button>)}
    </div>
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151a22]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
        <div><h2 className="text-sm font-semibold">{selected ?? "전체 섹터"} <span className="ml-2 font-normal text-zinc-500">{visible.length}종목</span></h2><p className="mt-1 text-xs text-zinc-500">기간 열을 누르면 정렬 방향이 바뀝니다.</p></div>
        <input aria-label="종목명 또는 종목코드 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="종목명 / 코드 검색" className="w-full rounded-md border border-white/10 bg-[#10141b] px-3 py-2 text-xs sm:w-52" />
      </div>
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs tabular-nums">
        <caption className="sr-only">{minerviniUniverses[universe].name} {selected ?? "전체 섹터"} 종목별 기간 등락률</caption>
        <thead className="bg-white/[0.025] text-zinc-400"><tr><th scope="col" className="px-4 py-3 text-left font-medium">종목</th><th scope="col" className="px-3 py-3 text-left font-medium">섹터</th><th scope="col" className="px-3 py-3 font-medium">종가(원)</th>{returnPeriods.map(p => <th scope="col" key={p.id} aria-sort={period === p.id ? descending ? "descending" : "ascending" : "none"} className="px-3 py-3 font-medium"><button type="button" onClick={() => sortBy(p.id)} className={period === p.id ? "text-zinc-100" : "hover:text-zinc-100"}>{p.label} {period === p.id ? descending ? "↓" : "↑" : "↕"}</button></th>)}</tr></thead>
        <tbody>{visible.map(r => <tr key={r.code} className="border-t border-white/5 hover:bg-white/[0.025]">
          <td className="px-4 py-3 text-left"><a href={`https://stock.naver.com/domestic/stock/${r.code}/chart`} target="_blank" rel="noreferrer" className="font-medium text-zinc-100 hover:underline">{r.name} ↗</a><p className="mt-1 text-[10px] text-zinc-500">{r.code}{!r.tradable ? " · 거래 제한" : ""}</p></td>
          <td className="px-3 py-3 text-left text-zinc-400" title={r.industry ?? "업종 미확인"}>{r.sector}</td><td className="px-3 py-3 text-zinc-200">{r.price?.toLocaleString("ko-KR") ?? "—"}</td>
          {returnPeriods.map(p => <td key={p.id} style={period === p.id ? heat(r.returns[p.id]) : undefined} className={`px-3 py-3 ${color(r.returns[p.id])} ${period === p.id ? "font-semibold" : ""}`}>{percent(r.returns[p.id])}</td>)}
        </tr>)}</tbody>
      </table></div>
      {!visible.length && <p role="status" className="px-4 py-14 text-center text-sm text-zinc-500">{busy && !snapshot ? "선택한 날짜의 전체 구성종목 시세를 수집하고 있습니다. 첫 조회는 1~2분 정도 걸릴 수 있습니다." : !snapshot ? "수집된 결과가 없습니다. 결과 새로고침으로 다시 시도해 주세요." : "조건에 맞는 종목이 없습니다."}</p>}
    </div>
    <details className="mt-4 rounded-lg border border-white/10 p-4 text-xs text-zinc-500"><summary className="cursor-pointer text-zinc-400">산정 기준과 섹터 분류 안내</summary><div className="mt-3 space-y-2 leading-relaxed">
      <p>표시 가격과 모든 기간의 비교 가격은 KRX 정규장 15:30 종가입니다. NXT 저녁 20:00 종가는 포함하지 않습니다. 일간 / 1W / 1M / 3M / 6M / 1Y는 각각 1 / 5 / 21 / 63 / 126 / 252거래일 전 KRX 종가 대비입니다. 배당은 포함하지 않습니다. 일봉 이력이 부족한 기간은 —로 표시하고 해당 기간 평균에서 제외합니다.</p>
      <p>섹터 등락률은 현재 지수 구성종목 중 해당 섹터의 유효 수익률 단순평균입니다. 공식 섹터 지수 수익률과는 다릅니다. 상승은 빨강, 하락은 파랑으로 표시합니다.</p>
      <p>네이버 업종을 리서치용 섹터로 묶고, 반도체장비·미용기기·일부 2차전지·원전 종목은 종목코드별 분류를 우선합니다. 한 종목은 한 섹터에만 포함하며 분류가 없는 종목은 기타/미분류에 표시합니다. 상세 업종명은 표의 섹터명에 마우스를 올려 확인할 수 있습니다.</p>
      <p>장중에는 직전 완료 거래일 결과를 표시합니다. 일부 종목의 수집이 실패하면 해당 지수의 마지막 정상 결과와 기준일을 유지합니다. 현재 구성 기준 비교이며 과거 편입·편출을 재현하지 않습니다. 시세·업종 출처: <a href="https://m.stock.naver.com" target="_blank" rel="noreferrer" className="underline">네이버 증권</a>.</p>
    </div></details>
  </section>;
}
function compare(a: number | null, b: number | null, descending: boolean) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return descending ? b - a : a - b;
}
function Metric({ label, value, note, tone = "text-zinc-100" }: { label: string; value: string; note: string; tone?: string }) {
  return <div className="rounded-xl border border-white/10 bg-[#151a22] p-4"><p className="text-xs text-zinc-500">{label}</p><p className={`my-2 text-lg font-semibold tabular-nums ${tone}`}>{value}</p><p className="text-[11px] text-zinc-500">{note}</p></div>;
}
