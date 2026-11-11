"use client";

import { useEffect, useMemo, useState } from "react";

const periods = [
  { id: "1d", label: "1D" }, { id: "3d", label: "3D" }, { id: "1w", label: "1W" },
  { id: "1m", label: "1M" }, { id: "3m", label: "3M" }, { id: "6m", label: "6M" }, { id: "1y", label: "1Y" },
] as const;
type Period = typeof periods[number]["id"];
type Market = "kospi" | "kosdaq";
type Row = { code: string; name: string; price: number | null; marketCap: number | null; returns: Record<Period, number | null> };
type Board = { snapshot: { market: Market; asOf: string; fetchedAt: string; priceBasis: string; rows: Row[] } | null; stale?: boolean; error?: string | null };
type SortKey = Period | "marketCap";
const formatPercent = (value: number | null) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const tone = (value: number | null) => value == null || value === 0 ? "text-zinc-400" : value > 0 ? "text-rose-400" : "text-sky-400";
const formatCap = (value: number | null) => value == null ? "—" : `${(value / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;

export function StockReturnsBoard() {
  const [market, setMarket] = useState<Market>("kospi");
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [minCap, setMinCap] = useState("");
  const [sort, setSort] = useState<SortKey>("marketCap");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError(null); setBoard(null);
      try {
        const response = await fetch(`/api/stock-returns?market=${market}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as Board;
        if (!response.ok) throw new Error(result.error || "데이터를 불러오지 못했습니다.");
        if (result.snapshot && (result.snapshot.market !== market || result.snapshot.priceBasis !== "KRX_REGULAR_CLOSE")) throw new Error("KRX 종가 기준 데이터를 확인할 수 없습니다.");
        if (!controller.signal.aborted) { setBoard(result); setError(result.error ?? null); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [market, reload]);

  const snapshot = board?.snapshot?.priceBasis === "KRX_REGULAR_CLOSE" && board.snapshot.market === market ? board.snapshot : null;
  const visible = useMemo(() => {
    const minimum = Number(minCap) * 100000000;
    return (snapshot?.rows ?? []).filter(row => {
      const matches = `${row.name} ${row.code}`.toLowerCase().includes(query.trim().toLowerCase());
      return matches && (!minCap || (row.marketCap != null && row.marketCap >= minimum));
    }).sort((a, b) => {
      const x = sort === "marketCap" ? a.marketCap : a.returns[sort];
      const y = sort === "marketCap" ? b.marketCap : b.returns[sort];
      if (x == null) return y == null ? a.name.localeCompare(b.name, "ko") : 1;
      if (y == null) return -1;
      return (descending ? y - x : x - y) || a.name.localeCompare(b.name, "ko");
    });
  }, [snapshot, query, minCap, sort, descending]);
  const pageSize = 100;
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  function sortBy(key: SortKey) {
    if (sort === key) setDescending(value => !value);
    else { setSort(key); setDescending(true); }
    setPage(1);
  }
  const sortLabel = (key: SortKey) => sort === key ? descending ? "↓" : "↑" : "↕";
  return <section aria-label="종목별 등락률">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg border border-white/10 bg-[#151a22] p-1" aria-label="시장 선택">
        {(["kospi", "kosdaq"] as const).map(id => <button key={id} type="button" aria-pressed={market === id} onClick={() => { setMarket(id); setPage(1); }} className={`rounded-md px-4 py-2 text-sm font-medium ${market === id ? "bg-emerald-400/15 text-emerald-200" : "text-zinc-400 hover:text-white"}`}>{id === "kospi" ? "코스피" : "코스닥"}</button>)}
      </div>
      <button type="button" disabled={busy} onClick={() => setReload(n => n + 1)} className="rounded-md border border-white/15 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40">{busy ? "불러오는 중…" : "새로고침"}</button>
    </div>
    <div className="mb-5 flex flex-wrap justify-between gap-2 text-xs text-zinc-500"><p>기준일 <span className="text-zinc-300">{snapshot?.asOf ?? "—"}</span> · KRX 정규장 15:30 종가</p><p>수집 {snapshot ? new Date(snapshot.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "—"} KST</p></div>
    {(error || board?.stale) && <p role="status" className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">{snapshot ? `${snapshot.asOf} 기준 결과 표시 중. ` : "수집된 결과가 없습니다. "}{error ?? "이전 결과입니다."}</p>}
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151a22]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 p-4">
        <div><h2 className="text-sm font-semibold">{market === "kospi" ? "코스피" : "코스닥"} 종목 <span className="ml-2 font-normal text-zinc-500">{visible.length.toLocaleString()}종목</span></h2><p className="mt-1 text-xs text-zinc-500">시가총액 또는 기간 열을 눌러 정렬하세요.</p></div>
        <div className="flex flex-wrap items-end gap-3"><label className="text-xs text-zinc-400">시가총액 이상 <span className="text-zinc-500">(억원)</span><input type="number" min="0" step="1" value={minCap} onChange={e => { setMinCap(e.target.value); setPage(1); }} placeholder="전체" className="mt-1 block w-36 rounded-md border border-white/10 bg-[#10141b] px-3 py-2 text-zinc-100" /></label><label className="text-xs text-zinc-400">종목 검색<input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="종목명 / 코드" className="mt-1 block w-44 rounded-md border border-white/10 bg-[#10141b] px-3 py-2 text-zinc-100" /></label></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs tabular-nums"><caption className="sr-only">종목별 시가총액과 기간별 등락률</caption><thead className="bg-white/[0.025] text-zinc-400"><tr><th scope="col" className="px-4 py-3 text-left font-medium">종목</th><th scope="col" className="px-3 py-3 font-medium">종가(원)</th><th scope="col" aria-sort={sort === "marketCap" ? descending ? "descending" : "ascending" : "none"} className="px-3 py-3 font-medium"><button type="button" onClick={() => sortBy("marketCap")} className={sort === "marketCap" ? "text-zinc-100" : "hover:text-zinc-100"}>시가총액(억원) {sortLabel("marketCap")}</button></th>{periods.map(p => <th scope="col" key={p.id} aria-sort={sort === p.id ? descending ? "descending" : "ascending" : "none"} className="px-3 py-3 font-medium"><button type="button" onClick={() => sortBy(p.id)} className={sort === p.id ? "text-zinc-100" : "hover:text-zinc-100"}>{p.label} {sortLabel(p.id)}</button></th>)}</tr></thead>
        <tbody>{visible.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => <tr key={row.code} className="border-t border-white/5 hover:bg-white/[0.025]"><td className="px-4 py-3 text-left"><a href={`https://stock.naver.com/domestic/stock/${row.code}/chart`} target="_blank" rel="noreferrer" className="font-medium text-zinc-100 hover:underline">{row.name} ↗</a><p className="mt-1 text-[10px] text-zinc-500">{row.code}</p></td><td className="px-3 py-3 text-zinc-200">{row.price?.toLocaleString("ko-KR") ?? "—"}</td><td className="px-3 py-3 text-zinc-200">{formatCap(row.marketCap)}</td>{periods.map(p => <td key={p.id} className={`px-3 py-3 ${tone(row.returns[p.id])} ${sort === p.id ? "font-semibold" : ""}`}>{formatPercent(row.returns[p.id])}</td>)}</tr>)}</tbody></table></div>
      {!visible.length && <p role="status" className="px-4 py-14 text-center text-sm text-zinc-500">{busy ? "종목 데이터를 불러오는 중입니다." : snapshot ? "조건에 맞는 종목이 없습니다." : "수집된 결과가 없습니다. 새로고침으로 다시 시도해 주세요."}</p>}
      {visible.length > pageSize && <div className="flex items-center justify-center gap-4 border-t border-white/10 p-4 text-xs text-zinc-400"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-30">이전</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-30">다음</button></div>}
    </div>
    <p className="mt-4 text-xs leading-relaxed text-zinc-500">모든 비교 가격은 KRX 정규장 종가 기준입니다. 1D / 3D / 1W / 1M / 3M / 6M / 1Y는 각각 1 / 3 / 5 / 21 / 63 / 126 / 252거래일 전 종가와 비교합니다. 이력이 부족하면 —로 표시합니다. 배당과 액면분할 등은 별도로 보정하지 않아 실제 투자 수익률과 다를 수 있습니다. 시가총액 필터는 억원 단위입니다.</p>
  </section>;
}
