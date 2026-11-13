"use client";
import { useEffect, useMemo, useState } from "react";
import type { buildRisingBoard } from "@/lib/market/rising";

type Board = ReturnType<typeof buildRisingBoard> & { asOf: string; fetchedAt: string; publishedAt: string; sessions: number; marketCaps: Record<string, number>; capsFetchedAt: string | null };
type Movement = "up" | "down" | "flat" | "missing";
type Sort = "streak" | "daily" | "week" | "breadth" | "marketCap";
const compareValues = (a: number | null | undefined, b: number | null | undefined, ascending: boolean) => {
  const aMissing = a == null || !Number.isFinite(a), bMissing = b == null || !Number.isFinite(b);
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  return ascending ? a! - b! : b! - a!;
};
const movementOf = (value: number | null | undefined): Movement => value == null || !Number.isFinite(value) ? "missing" : value > 0 ? "up" : value < 0 ? "down" : "flat";
const movementLabel: Record<Movement, string> = { up: "상승", down: "하락", flat: "보합", missing: "결측" };
const pct = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number | null | undefined) => v == null || v === 0 ? "text-zinc-400" : v > 0 ? "text-rose-400" : "text-blue-400";
const streakLabel = (v: { count: number; incomplete: boolean }) => v.count ? `${v.incomplete ? "≥" : ""}${v.count}일` : v.incomplete ? "확인 불가" : "0일";
const timestamp = (v: string) => new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
const button = (active: boolean) => `rounded-lg px-3 py-2 text-xs font-medium ${active ? "bg-emerald-400 text-zinc-950" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`;
export function RisingBoard() {
  const [universe, setUniverse] = useState("kospi200");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"stocks" | "sectors">("stocks");
  const [days, setDays] = useState(1);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [ascending, setAscending] = useState(false);
  const [sort, setSort] = useState<Sort>("streak");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setBoard(null); setError("");
    fetch(`/api/rising?universe=${universe}`, { signal: controller.signal }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); setBoard(body); }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [universe]);
  const distribution = useMemo(() => {
    const result = { up: 0, down: 0, flat: 0, missing: 0 };
    for (const row of board?.stocks ?? []) {
      const value = row.returns["1d"];
      if (value == null || !Number.isFinite(value)) result.missing++;
      else if (value > 0) result.up++;
      else if (value < 0) result.down++;
      else result.flat++;
    }
    return result;
  }, [board]);
  const stocks = useMemo(() => (board?.stocks ?? []).filter(r => (movement ? movementOf(r.returns["1d"]) === movement : r.streak.count >= days) && `${r.name} ${r.code} ${r.sector}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => {
    const v = (r: typeof a) => sort === "streak" ? r.streak.count : sort === "daily" ? r.returns["1d"] : sort === "marketCap" ? board?.marketCaps[r.code] : r.returns["1w"];
    return compareValues(v(a), v(b), ascending) || a.name.localeCompare(b.name);
  }), [board, days, movement, query, sort, ascending]);
  const sectors = useMemo(() => (board?.sectors ?? []).filter(r => r.streak.count >= days && r.sector.toLowerCase().includes(query.toLowerCase())).sort((a,b) => {
    const v = (r: typeof a) => sort === "streak" ? r.streak.count : sort === "daily" ? r.daily : sort === "breadth" ? r.breadth : r.week;
    return compareValues(v(a), v(b), ascending) || a.sector.localeCompare(b.sector);
  }), [board, days, query, sort, ascending]);
  return <section aria-label="연속 상승 분석">
    <div className="mb-4 flex flex-wrap gap-2">{[["kospi200","코스피200"],["kosdaq150","코스닥150"]].map(([id,label]) => <button key={id} className={button(universe === id)} aria-pressed={universe === id} onClick={() => setUniverse(id)}>{label}</button>)}</div>
    <div className="mb-5 rounded-xl border border-white/10 bg-[#151a22] p-4 text-xs leading-6 text-zinc-400">{board ? <>기준일 <strong className="text-zinc-100">{board.asOf}</strong> · KRX 정규장 15:30 종가 · 수집 {timestamp(board.fetchedAt)} KST · 배포 {timestamp(board.publishedAt)} KST<br />최근 {board.sessions}거래일 자료 확인 · 현재 구성종목 기준 · ≥는 이전 이력이 부족해 연속일수가 더 길 수 있음을 뜻합니다.</> : error || "데이터를 불러오는 중입니다."}</div>
    {board && <div className="mb-5 rounded-xl border border-white/10 bg-[#151a22] p-4"><p className="mb-3 text-sm font-semibold">전체 구성종목 일간 등락 <span className="ml-2 text-xs font-normal text-zinc-500">필터 적용 전 · 전체 {board.stocks.length}종목 기준</span></p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([["up", distribution.up, "text-rose-400"], ["down", distribution.down, "text-blue-400"], ["flat", distribution.flat, "text-zinc-200"], ["missing", distribution.missing, "text-zinc-400"]] as const).map(([id, count, color]) => <button type="button" key={id} aria-pressed={kind === "stocks" && movement === id} onClick={() => { setKind("stocks"); setMovement(id); setQuery(""); if (sort === "breadth") setSort("streak"); }} className={`rounded-lg border px-3 py-2 text-left transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${kind === "stocks" && movement === id ? "border-emerald-400 bg-white/10" : "border-transparent bg-white/[0.03]"}`}><span className="block text-xs text-zinc-400">{movementLabel[id]} · 목록 보기</span><span className={`mt-1 block text-lg font-semibold tabular-nums ${color}`}>{count}종목 <span className="text-xs font-normal">{board.stocks.length ? (count / board.stocks.length * 100).toFixed(1) : "0.0"}%</span></span></button>)}</div></div>}
    <div className="mb-4 flex flex-wrap items-center gap-2"><div className="mr-3 flex gap-1">{([["stocks","종목"],["sectors","섹터"]] as const).map(([id,label]) => <button key={id} className={button(kind === id)} aria-pressed={kind === id} onClick={() => { setKind(id); setMovement(null); if ((id === "stocks" && sort === "breadth") || (id === "sectors" && sort === "marketCap")) setSort("streak"); }}>{label}</button>)}</div>{[1,2,3].map(n => <button key={n} className={button(movement === null && days === n)} aria-pressed={movement === null && days === n} onClick={() => { setMovement(null); setDays(n); }}>{n === 3 ? "3일 이상" : `${n}일 이상`}</button>)}<input className="ml-auto rounded-lg border border-white/10 bg-[#10141b] px-3 py-2 text-xs" placeholder="종목명 · 코드 · 섹터 검색" aria-label="검색" value={query} onChange={e => setQuery(e.target.value)} /><label className="text-xs text-zinc-400">정렬 <select className="ml-1 rounded-lg border border-white/10 bg-[#10141b] px-2 py-2 text-zinc-200" value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="streak">연속 상승일</option><option value="daily">일간 수익률</option><option value="week">1주 수익률</option>{kind === "sectors" ? <option value="breadth">상승 종목 비율</option> : <option value="marketCap">시가총액</option>}</select></label><button type="button" className={button(false)} aria-label={`정렬 방향: ${ascending ? "오름차순" : "내림차순"}`} onClick={() => setAscending(!ascending)}>{ascending ? "오름차순 ↑" : "내림차순 ↓"}</button></div>
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151a22]"><div className="border-b border-white/10 p-4 text-sm font-semibold">{kind === "stocks" ? movement ? `${movementLabel[movement]} 종목` : "연속 상승 종목" : "연속 상승 섹터"} <span className="ml-2 text-xs font-normal text-zinc-500">{kind === "stocks" ? stocks.length : sectors.length}개 · {ascending ? "오름차순" : "내림차순"}</span></div><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs tabular-nums"><thead className="bg-white/[0.025] text-zinc-400">{kind === "stocks" ? <tr><th className="px-4 py-3 text-left">종목</th><th className="px-3 py-3 text-left">섹터</th><th className="px-3 py-3">연속 상승</th><th className="px-3 py-3">종가</th><th className="px-3 py-3">시총 (억원)</th><th className="px-3 py-3">일간</th><th className="px-3 py-3">1주</th><th className="px-3 py-3">1개월</th></tr> : <tr><th className="px-4 py-3 text-left">섹터</th><th className="px-3 py-3">연속 상승</th><th className="px-3 py-3">일간 평균</th><th className="px-3 py-3">1주 평균</th><th className="px-3 py-3">상승 종목 비율</th><th className="px-3 py-3">구성 종목</th></tr>}</thead><tbody>{kind === "stocks" ? stocks.map(r => <tr key={r.code} className="border-t border-white/5"><td className="px-4 py-3 text-left"><a className="text-zinc-100 hover:underline" href={`https://finance.naver.com/item/main.naver?code=${encodeURIComponent(r.code)}`} target="_blank" rel="noreferrer">{r.name} ↗</a><div className="mt-1 text-zinc-500">{r.code}</div></td><td className="px-3 py-3 text-left text-zinc-400">{r.sector}</td><td className="px-3 py-3 font-semibold text-emerald-300">{streakLabel(r.streak)}</td><td className="px-3 py-3">{r.price?.toLocaleString("ko-KR") ?? "—"}</td><td className="px-3 py-3">{board?.marketCaps[r.code] != null ? (board.marketCaps[r.code] / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 }) : "—"}</td>{(["1d","1w","1m"] as const).map(p => <td key={p} className={`px-3 py-3 ${tone(r.returns[p])}`}>{pct(r.returns[p])}</td>)}</tr>) : sectors.map(r => <tr key={r.sector} className="border-t border-white/5"><td className="px-4 py-3 text-left font-medium">{r.sector}</td><td className="px-3 py-3 font-semibold text-emerald-300">{streakLabel(r.streak)}</td><td className={`px-3 py-3 ${tone(r.daily)}`}>{pct(r.daily)}</td><td className={`px-3 py-3 ${tone(r.week)}`}>{pct(r.week)} <span className="text-zinc-500">({r.weekCoverage}/{r.count})</span></td><td className="px-3 py-3">{r.breadth == null ? "—" : `${r.breadth.toFixed(0)}%`} <span className="text-zinc-500">({r.coverage}/{r.count})</span></td><td className="px-3 py-3">{r.count}</td></tr>)}</tbody></table></div>{board && !(kind === "stocks" ? stocks.length : sectors.length) && <p className="p-10 text-center text-sm text-zinc-500">조건에 맞는 결과가 없습니다.</p>}</div>
    <details className="mt-4 rounded-lg border border-white/10 p-4 text-xs leading-6 text-zinc-400"><summary className="cursor-pointer text-zinc-300">계산 기준과 활용 방법</summary><p className="mt-2">연속 상승은 직전 거래일 종가보다 높은 날을 최신 거래일부터 셉니다. 보합·하락은 연속을 끊고 결측은 확인을 중단합니다. 1·2일 필터는 해당 일수 이상, 3일 필터는 3일 이상입니다.</p><p>섹터의 일간 수익률은 현재 구성 종목의 동일가중 평균이며, 모든 구성 종목의 수익률이 있어야 해당 일의 상승 여부를 계산합니다. 공식 섹터 지수가 아닙니다. 상승 종목 비율은 유효한 일간 수익률 중 상승한 종목의 비율입니다. 1주 평균은 유효 종목만 사용하며 괄호에 유효/전체 종목 수를 표시합니다.</p><p>상단 등락 집계는 검색과 연속 상승 필터 적용 전 전체 구성종목을 기준으로 하며 결측도 전체에 포함합니다. 집계 항목을 누르면 검색과 연속 상승 조건을 해제하고 해당 종목 목록을 표시합니다. 연속 상승 버튼을 누르면 연속 상승 목록으로 돌아갑니다. 시가총액은 같은 기준일의 KRX 종가와 대조해 일치하는 값만 사용하며, 미확보 종목은 —로 표시하고 정렬 시 뒤에 둡니다.</p><p>연속 상승일, 1주 수익률과 섹터 상승 비율을 함께 정렬해 주도 후보를 살펴볼 수 있습니다. 1주·1개월은 각각 5·21거래일 전 종가 대비입니다. 구성과 섹터 분류는 수집 시점 기준으로 과거 편입 변화를 재현하지 않으며, 코스피200·코스닥150 밖의 종목은 포함하지 않습니다.</p></details>
  </section>;
}
