import { readFile } from "node:fs/promises";
import { addDays, events, reviewedAt, seoulDate, upcomingEvents, undatedEvents } from "@/lib/events/calendar";
import type { Snapshot } from "@/lib/events/refresh";

export const dynamic = "force-dynamic";
async function loadSnapshot(): Promise<Snapshot | null> {
  try { return JSON.parse(await readFile("data/events/board.json", "utf8")) as Snapshot; } catch { return null; }
}
function kst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).format(new Date(iso));
}
export default async function EventsPage() {
  const today = seoulDate(new Date()), end = addDays(today, 27), snapshot = await loadSnapshot();
  const feeds = snapshot?.feeds ?? {};
  const stale = (value: string | null | undefined) => !value || Date.now() - Date.parse(value) > 48 * 3600000;
  const manual = events.filter(e => !(e.country === "US" && e.category === "매크로" && feeds.show?.updatedAt) && !(e.sourceName === "ISM" && feeds.ism?.updatedAt));
  const ism = feeds.ism?.events ?? [];
  const show = (feeds.show?.events ?? []).filter(e => !ism.some(i => i.date === e.date && /ism/i.test(e.title) && (/manufactur/i.test(e.title) === /제조업/.test(i.title)) && (/services?/i.test(e.title) === /서비스업/.test(i.title))));
  const all = upcomingEvents(today, [...manual, ...show, ...ism]);
  const items = all.filter(e => !e.tentative);
  const tentative = all.filter(e => e.tentative);
  return <div>
    <header className="mb-6">
      <p className="mb-2 text-xs font-semibold tracking-widest text-rose-300">MARKET CALENDAR</p>
      <h1 className="text-2xl font-semibold tracking-tight">주요 매크로 · 실적 캘린더</h1>
      <p className="mt-2 text-sm text-zinc-400">한국과 미국의 시장 영향력이 큰 일정 · 모든 날짜와 시간은 한국시간 (KST)</p>
    </header>
    <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
      <p className="font-medium text-white">{today} ~ {end} <span className="ml-2 text-xs font-normal text-zinc-400">오늘 포함 28일</span></p>
      <p className="mt-2 text-xs leading-5 text-zinc-400">미국 주요 매크로는 무료 ShowMyTrades, ISM은 공식 일정에서 매일 16:00 KST 갱신을 시도합니다. 한국 매크로와 기업 실적은 수동 확인 ({reviewedAt})이며 자동 갱신되지 않습니다. 모든 중요 일정이 포함된 것은 아닙니다. 한국 일정은 <a href="https://www.financecalendar.com/calendar/" target="_blank" rel="noreferrer" className="underline">Finance Calendar ↗</a>에서도 확인할 수 있습니다.</p>
      {([ ["show", "ShowMyTrades (미국)"], ["ism", "ISM"] ] as const).map(([key, label]) => { const feed = feeds[key]; return <p key={key} className={`mt-1 text-xs ${!feed || feed.error || stale(feed.updatedAt) ? "text-amber-300" : "text-zinc-400"}`}>{label}: {!feed ? "자동 수집 결과 없음 · 수동 자료 사용" : `${feed.updatedAt ? `마지막 성공 ${kst(feed.updatedAt)} KST` : "수집 성공 기록 없음"}${feed.error ? " · 최근 수집 실패, 이전 결과 유지" : stale(feed.updatedAt) ? " · 갱신 지연" : ""}`}</p>; })}
      <p className="mt-2 text-xs text-zinc-400">미국 원본은 수집 시각의 6시간 전부터 제공하므로 오늘 오전 등 이미 지난 일정은 빠질 수 있습니다. <a className="underline" href="https://showmytrades.com/tools/economic-calendar" target="_blank" rel="noreferrer">Economic calendar by ShowMyTrades ↗</a></p>
      {end > "2026-12-03" && <p className="mt-2 text-xs text-amber-300">수동 확인 범위 밖의 일정은 누락될 수 있습니다. 원문을 확인해 주세요.</p>}
    </div>
    <div className="space-y-3">
      {items.length === 0 && <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-400">이 기간에 확인된 일정이 없습니다. 일정이 없다는 뜻은 아닙니다.</p>}
      {items.map(event => <article key={event.id} className="grid gap-3 rounded-xl border border-white/10 bg-[#151a22] p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center">
        <div><p className="font-semibold text-zinc-100">{event.date}</p><p className={`mt-1 text-sm ${event.time ? "text-zinc-400" : "text-amber-300"}`}>{event.time ? `${event.time} KST` : "시간 미확정"}</p></div>
        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-white/10 px-2 py-0.5 text-xs text-zinc-300">{event.country === "KR" ? "한국" : "미국"}</span><span className="rounded bg-rose-950 px-2 py-0.5 text-xs text-rose-200">{event.category}</span><h2 className="font-medium text-white">{event.title}</h2></div><p className="mt-2 text-sm text-zinc-400">{event.detail}</p></div>
        <a href={event.source} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 underline underline-offset-4 hover:text-white">{event.sourceName} ↗</a>
      </article>)}
    </div>
    <section className="mt-8 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
      <h2 className="font-semibold text-white">일정 미확정 · 확인 필요</h2>
      <p className="mt-2 text-xs leading-5 text-zinc-400">제공처가 날짜 또는 시간을 확정하지 못했거나 출처 간 의견이 다른 일정입니다. 예상 시각은 바뀔 수 있습니다.</p>
      <div className="mt-4 space-y-2">{tentative.map(event => <div key={event.id} className="rounded-md border border-white/10 p-3 text-sm"><span className="font-medium text-white">{event.title}</span><span className="ml-2 text-amber-300">미확정</span><p className="mt-1 text-zinc-400">예상 {event.date} {event.time} KST · {event.detail}</p><a className="mt-1 inline-block text-xs text-zinc-400 underline" href={event.source} target="_blank" rel="noreferrer">출처 확인 ↗</a></div>)}{undatedEvents.length === 0 && tentative.length === 0 ? <p className="text-sm text-zinc-400">현재 확인된 미확정 예정 일정이 없습니다.</p> : undatedEvents.map(event => <div key={event.title} className="rounded-md border border-white/10 p-3 text-sm"><span className="font-medium text-white">{event.title}</span><span className="ml-2 text-amber-300">날짜 미확정</span><p className="mt-1 text-zinc-400">{event.detail} · 확인 {event.checkedAt}</p><a className="mt-1 inline-block text-xs text-zinc-400 underline" href={event.source} target="_blank" rel="noreferrer">출처 확인 ↗</a></div>)}</div>
    </section>
  </div>;
}



