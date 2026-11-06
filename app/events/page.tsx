import Link from "next/link";
import { readFile } from "node:fs/promises";
import { addDays, events, reviewedAt, seoulDate, upcomingEvents } from "@/lib/events/calendar";
import type { Feed, Snapshot } from "@/lib/events/refresh";

export const dynamic = "force-dynamic";
async function loadSnapshot(): Promise<Snapshot | null> {
  try { return JSON.parse(await readFile("data/events/board.json", "utf8")) as Snapshot; } catch { return null; }
}
function kst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).format(new Date(iso));
}
function feedStatus(label:string, feed:Feed | undefined) {
  const stale=!feed?.updatedAt || Date.now()-Date.parse(feed.updatedAt)>48*3600000;
  return <p className={`mt-1 text-xs ${!feed || feed.error || stale ? "text-amber-300" : "text-zinc-400"}`}>{label}: {!feed ? "자동 수집 결과 없음" : `${feed.updatedAt ? `마지막 성공 ${kst(feed.updatedAt)} KST` : "수집 성공 기록 없음"}${feed.error ? ` · 최근 수집 실패: ${feed.error}` : stale ? " · 갱신 지연" : ""}`}</p>;
}
export default async function EventsPage({searchParams}:{searchParams:Promise<{country?:string}>}) {
  const country=(await searchParams).country === "us" ? "US" : "KR";
  const today=seoulDate(new Date()), end=addDays(today,27), snapshot=await loadSnapshot(), feeds=snapshot?.feeds ?? {};
  const manual=events.filter(e => !(e.country === "US" && e.category === "매크로" && feeds.show?.updatedAt) && !(e.sourceName === "ISM" && feeds.ism?.updatedAt));
  const ism=feeds.ism?.events ?? [];
  const show=(feeds.show?.events ?? []).filter(e=>!ism.some(i=>i.date===e.date && /ism/i.test(e.title) && (/manufactur/i.test(e.title)===/제조업/.test(i.title)) && (/services?/i.test(e.title)===/서비스업/.test(i.title))));
  const all=upcomingEvents(today,[...manual,...show,...ism,...(feeds.dart?.events ?? [])]).filter(e=>e.country===country);
  const items=all.filter(e=>!e.tentative), tentative=all.filter(e=>e.tentative);
  const unknown=(feeds.dart?.companies ?? []).filter(c=>c.status==="확인되지 않음" || c.status==="공시 확인 필요");
  return <div>
    <header className="mb-6">
      <p className="mb-2 text-xs font-semibold tracking-widest text-rose-300">MARKET CALENDAR</p>
      <h1 className="text-2xl font-semibold tracking-tight">주요 매크로 · 실적 캘린더</h1>
      <p className="mt-2 text-sm text-zinc-400">오늘부터 28일 · 모든 날짜와 시간은 한국시간 (KST)</p>
    </header>
    <nav aria-label="국가별 캘린더" className="mb-5 flex gap-2 border-b border-white/10">
      {([ ["KR","한국 캘린더","/events?country=kr"], ["US","미국 캘린더","/events?country=us"] ] as const).map(([id,label,href])=><Link key={id} href={href} aria-current={country===id?"page":undefined} className={`border-b-2 px-4 py-3 text-sm font-medium ${country===id?"border-rose-400 text-white":"border-transparent text-zinc-400 hover:text-white"}`}>{label}</Link>)}
    </nav>
    <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
      <p className="font-medium text-white">{today} ~ {end} <span className="ml-2 text-xs font-normal text-zinc-400">오늘 포함 28일</span></p>
      {country==="KR" ? <>
        <p className="mt-2 text-xs leading-5 text-zinc-400">코스피 보통주 시총 상위 30개 기업의 DART 실적 공시예고와 실적 설명회를 매일 16:00 KST 수집합니다. 시총 기준: {feeds.dart?.capAsOf ? `${feeds.dart.capAsOf} KRX 정규장 15:30 종가` : "확인되지 않음"}. 한국 매크로는 수동 확인 ({reviewedAt}) 자료입니다.</p>
        {feedStatus("DART · KRX",feeds.dart)}
        <p className="mt-2 text-xs leading-5 text-zinc-400">공시예고가 없으면 날짜를 추측하지 않습니다. 공시와 IR 설명회는 별개이며 정정·취소될 수 있습니다. 발표일이 4주 밖인 일정은 목록에 표시되지 않습니다.</p>
      </> : <>
        <p className="mt-2 text-xs leading-5 text-zinc-400">미국 주요 매크로는 ShowMyTrades, ISM은 공식 일정에서 매일 16:00 KST 갱신을 시도합니다. 기업 실적은 수동 확인 ({reviewedAt}) 자료입니다.</p>
        {feedStatus("ShowMyTrades",feeds.show)}{feedStatus("ISM",feeds.ism)}
        <p className="mt-2 text-xs text-zinc-400">미국 원본은 수집 시각의 6시간 전부터 제공하므로 이미 지난 일정이 빠질 수 있습니다. <a className="underline" href="https://showmytrades.com/tools/economic-calendar" target="_blank" rel="noreferrer">Economic calendar by ShowMyTrades ↗</a></p>
      </>}
      <p className="mt-2 text-xs text-amber-300">모든 일정이 포함되는 것은 아니며, 원문을 확인해 주세요.</p>
    </div>
    <div className="space-y-3">
      {items.length===0 && <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-400">이 기간에 확인된 일정이 없습니다. 실제 일정이 없다는 뜻은 아닙니다.</p>}
      {items.map(event=><article key={event.id} className="grid gap-3 rounded-xl border border-white/10 bg-[#151a22] p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center">
        <div><p className="font-semibold text-zinc-100">{event.date}</p><p className={`mt-1 text-sm ${event.time?"text-zinc-400":"text-amber-300"}`}>{event.time?`${event.time} KST`:"시간 미확정"}</p></div>
        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-rose-950 px-2 py-0.5 text-xs text-rose-200">{event.category}</span><h2 className="font-medium text-white">{event.title}</h2></div><p className="mt-2 text-sm text-zinc-400">{event.detail}</p></div>
        <a href={event.source} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 underline underline-offset-4 hover:text-white">{event.sourceName} ↗</a>
      </article>)}
    </div>
    <section className="mt-8 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
      <h2 className="font-semibold text-white">일정 미확정 · 확인 필요</h2>
      {country==="KR" ? <>
        <p className="mt-2 text-xs leading-5 text-zinc-400">DART에서 차기 실적 예정일을 확인하지 못한 상위 기업입니다. 향후 4주 내 발표 예정이라는 뜻은 아닙니다. 최근 실적이 이미 발표되었을 수도 있습니다.</p>
        {!feeds.dart?.updatedAt && <p className="mt-3 text-sm text-amber-300">상위 기업 수집 결과가 없어 미확정 여부를 판단할 수 없습니다.</p>}
        <div className="mt-3 flex flex-wrap gap-2">{unknown.map(c=><span key={c.code} className="rounded border border-white/10 px-3 py-2 text-sm text-zinc-200">{c.name} <span className="text-xs text-amber-300">{c.status}</span>{c.source && <> · <a href={c.source} target="_blank" rel="noreferrer" className="underline">DART</a></>}</span>)}</div>
      </> : <><p className="mt-2 text-xs leading-5 text-zinc-400">제공처가 날짜 또는 시간을 확정하지 못했거나 출처 간 의견이 다른 일정입니다.</p>
        <div className="mt-4 space-y-2">{tentative.length===0 ? <p className="text-sm text-zinc-400">현재 확인된 미확정 예정 일정이 없습니다.</p> : tentative.map(event=><div key={event.id} className="rounded-md border border-white/10 p-3 text-sm"><span className="font-medium text-white">{event.title}</span><span className="ml-2 text-amber-300">미확정</span><p className="mt-1 text-zinc-400">예상 {event.date} {event.time} KST · {event.detail}</p><a className="mt-1 inline-block text-xs text-zinc-400 underline" href={event.source} target="_blank" rel="noreferrer">출처 확인 ↗</a></div>)}</div>
      </>}
    </section>
  </div>;
}
