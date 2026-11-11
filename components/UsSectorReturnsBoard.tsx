"use client";
import { useEffect, useMemo, useState } from "react";
import { returnPeriods, type Returns, type ReturnPeriod } from "@/lib/market/sector-returns";
type Row = { code: string; name: string; sector: string; industry: string; membership: string; price: number | null; returns: Returns };
type Board = { asOf: string; requestedDate: string | null; latestDate: string; dates: string[]; fetchedAt: string; rows: Row[] };
const percent = (v: number | null) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const color = (v: number | null) => v == null || v === 0 ? "text-zinc-400" : v > 0 ? "text-rose-400" : "text-sky-400";
const compare = (a: number | null, b: number | null, desc = true) => a == null ? b == null ? 0 : 1 : b == null ? -1 : desc ? b-a : a-b;
export function UsSectorReturnsBoard() {
  const [board,setBoard] = useState<Board | null>(null);
  const [date,setDate] = useState("");
  const [period,setPeriod] = useState<ReturnPeriod>("1d");
  const [sector,setSector] = useState<string | null>(null);
  const [query,setQuery] = useState("");
  const [descending,setDescending] = useState(true);
  const [error,setError] = useState("");
  const [reload,setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(`/api/valuation/us-sectors${date ? `?date=${date}` : ""}`, { signal: controller.signal, cache: "no-store" }).then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error); setBoard(value); }).catch(e => { if (!controller.signal.aborted) { setBoard(null); setError(e.message); } });
    return () => controller.abort();
  },[date,reload]);
  const rows = board?.rows ?? [];
  const summaries = useMemo(() => [...new Set(rows.map(r => r.sector))].map(name => {
    const members = rows.filter(r => r.sector === name);
    const values = members.flatMap(r => r.returns[period] == null ? [] : [r.returns[period]!]);
    return { name, count: members.length, coverage: values.length, value: values.length ? values.reduce((a,b) => a+b,0)/values.length : null };
  }).sort((a,b) => compare(a.value,b.value)), [rows,period]);
  const visible = rows.filter(r => (!sector || r.sector === sector) && `${r.name} ${r.code}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => compare(a.returns[period],b.returns[period],descending) || a.name.localeCompare(b.name));
  return <section aria-label="미국 섹터별 등락률 분석">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-300">S&amp;P 500 + NASDAQ 100 중복 제거</p><div className="flex gap-2"><select aria-label="미국 기준 날짜 선택" value={date} onChange={e => setDate(e.target.value)} className="rounded-md border border-white/15 bg-[#151a22] px-3 py-2 text-xs text-zinc-100"><option value="">최신 거래일</option>{board?.dates.slice().reverse().map(d => <option key={d}>{d}</option>)}</select><button onClick={() => setReload(n => n+1)} className="rounded-md border border-white/15 px-3 py-2 text-xs">결과 새로고침</button></div></div>
    <p className="mb-4 text-xs text-zinc-500">기준일 {board?.asOf ?? "—"} · 미국 정규장 종가 · 뉴욕 거래일 ET (통상 16:00, 조기 폐장일은 별도) · 수집 {board ? new Date(board.fetchedAt).toLocaleString("ko-KR", { timeZone:"Asia/Seoul", hour12:false }) : "—"} KST</p>
    {error && <p role="status" className="mb-4 rounded-lg border border-amber-500/20 p-3 text-sm text-amber-200">{error}</p>}
    <div className="mb-5 flex flex-wrap gap-2">{returnPeriods.map(p => <button key={p.id} onClick={() => {setPeriod(p.id);setDescending(true);}} aria-pressed={period===p.id} className={`rounded-md px-3 py-2 text-xs ${period===p.id ? "bg-zinc-100 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>{p.label}</button>)}</div>
    <div className="mb-3 flex justify-between text-sm"><span>섹터별 흐름 · 동일가중 평균</span><button onClick={() => setSector(null)} className="text-zinc-400">전체 종목</button></div>
    <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{summaries.map(s => <button key={s.name} aria-pressed={sector===s.name} onClick={() => setSector(sector===s.name ? null : s.name)} className={`rounded-lg border p-3 text-left ${sector===s.name ? "border-zinc-200" : "border-white/10"}`}><p className="text-xs">{s.name}</p><p className={`mt-3 text-xl font-semibold ${color(s.value)}`}>{percent(s.value)}</p><p className="mt-1 text-[11px] text-zinc-500">{s.count}종목 · 산정 {s.coverage}/{s.count}</p></button>)}</div>
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151a22]"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><h2 className="text-sm">{sector ?? "전체 섹터"} · {visible.length}종목</h2><input aria-label="미국 종목 검색" placeholder="종목명 / 티커 검색" value={query} onChange={e => setQuery(e.target.value)} className="rounded-md border border-white/10 bg-[#10141b] px-3 py-2 text-xs" /></div><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs tabular-nums"><thead className="bg-white/[0.025] text-zinc-400"><tr><th className="px-4 py-3 text-left">종목</th><th className="px-3 py-3 text-left">섹터</th><th className="px-3 py-3">종가(USD)</th>{returnPeriods.map(p => <th key={p.id} className="px-3 py-3"><button onClick={() => {if (period===p.id) setDescending(!descending); else {setPeriod(p.id);setDescending(true);}}}>{p.label} {period===p.id ? descending ? "↓" : "↑" : "↕"}</button></th>)}</tr></thead><tbody>{visible.map(r => <tr key={r.code} className="border-t border-white/5"><td className="px-4 py-3 text-left"><a href={`https://finance.yahoo.com/quote/${encodeURIComponent(r.code.replace(".","-"))}/`} target="_blank" rel="noreferrer" className="text-zinc-100 hover:underline">{r.name} ↗</a><p className="mt-1 text-[10px] text-zinc-500">{r.code} · {r.membership}</p></td><td className="px-3 py-3 text-left text-zinc-400" title={r.industry}>{r.sector}</td><td className="px-3 py-3">{r.price?.toLocaleString("en-US",{maximumFractionDigits:2}) ?? "—"}</td>{returnPeriods.map(p => <td key={p.id} className={`px-3 py-3 ${color(r.returns[p.id])}`}>{percent(r.returns[p.id])}</td>)}</tr>)}</tbody></table></div>{!visible.length && <p className="p-10 text-center text-sm text-zinc-500">{error || (board ? "조건에 맞는 종목이 없습니다." : "데이터를 불러오는 중입니다.")}</p>}</div>
    <details className="mt-4 rounded-lg border border-white/10 p-4 text-xs leading-relaxed text-zinc-500"><summary className="cursor-pointer text-zinc-400">산정 기준과 섹터 분류 안내</summary><p className="mt-3">S&amp;P 500 구성종목과 나스닥 100 구성종목을 티커 기준으로 합칩니다. 두 종류의 주식이 상장된 기업은 각 티커가 포함될 수 있습니다. 구성과 업종은 수집 시점 기준이며 과거 편입·편출은 재현하지 않습니다.</p><p className="mt-2">섹터는 원본 세부 업종을 리서치용으로 묶은 분류이며 공식 지수가 아닙니다. 업종명은 표의 섹터에 마우스를 올리면 확인할 수 있습니다. 등락률은 1·5·21·63·126·252 미국 거래일 전 종가 대비이며 배당은 포함하지 않습니다. 값이 없는 종목은 평균에서 제외합니다.</p><p className="mt-2">출처: <a className="underline" href="https://github.com/datasets/s-and-p-500-companies">S&amp;P 500 구성·업종</a>, <a className="underline" href="https://github.com/Gary-Strauss/NASDAQ100_Constituents">NASDAQ 100 구성·업종</a>, <a className="underline" href="https://finance.yahoo.com/">Yahoo Finance 종가</a>. 구성 자료는 제3자 집계이며 공식 실시간 명단이 아닙니다. 종가 미수집 시 —로 표시합니다.</p></details>
  </section>;
}
