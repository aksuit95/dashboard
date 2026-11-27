import Link from "next/link";
import { DataFreshness, latestDataTime } from "@/components/DataFreshness";
import { readFile } from "node:fs/promises";
import { addDays, events, isKoreanEarningsSeason, reviewedAt, seoulDate, upcomingEvents } from "@/lib/events/calendar";
import type { Feed, Snapshot } from "@/lib/events/refresh";
import { koreanEventTitle, mergeRecentEvents, parseShowMyTrades, SHOWMYTRADES_URL } from "@/lib/events/showmytrades";
import { KOREAN_MACRO_FEEDS } from "@/lib/events/korean-macro";
import type { MarketEvent } from "@/lib/events/calendar";

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
function values(event:MarketEvent, past:boolean) {
  if (event.country === "KR") {
    return <p className="mt-2 text-xs text-zinc-300">
      실제 {event.actual ?? (past ? "미제공" : "발표 전")} · 이전 {event.previous ?? "미제공"}
      {event.forecast && <> · 컨센서스 {event.forecast}{event.forecastSource && <> <a className="underline underline-offset-2" href={event.forecastSource} target="_blank" rel="noreferrer">{event.forecastLabel ?? "출처"} ↗</a></>}</>}
    </p>;
  }
  return <p className="mt-2 text-xs text-zinc-300">예상 {event.forecast ?? "미제공"} · 실제 {event.actual ?? (past ? "미제공" : "발표 전")} · 이전 {event.previous ?? "미제공"}</p>;
}
function title(event:MarketEvent) {
  const translated=event.country === "US" ? koreanEventTitle(event.title) : event.title;
  return <>{translated}{translated !== event.title && <span className="ml-2 text-xs font-normal text-zinc-400">{event.title}</span>}</>;
}
export default async function EventsPage({searchParams}:{searchParams:Promise<{country?:string}>}) {
  const country=(await searchParams).country === "kr" ? "KR" : "US";
  const now=new Date(), today=seoulDate(now), end=addDays(today,27), snapshot=await loadSnapshot(), feeds=snapshot?.feeds ?? {};
  let live:MarketEvent[] | null=null;
  if(country === "US") {
    try {
      const response=await fetch(SHOWMYTRADES_URL,{next:{revalidate:900},signal:AbortSignal.timeout(5000)});
      if(response.ok) live=parseShowMyTrades(await response.json(),now).events;
    } catch { /* Use the last persisted snapshot when the provider is unavailable. */ }
  }
  const krMacroFeeds = Object.entries(KOREAN_MACRO_FEEDS).map(([key, label]) => ({ label, feed: feeds[key] }));
  const krMacro = krMacroFeeds.flatMap(({feed}) => feed?.events ?? []);
  const manual=events.filter(e => !(e.country === "US" && e.category === "매크로" && feeds.show?.updatedAt) &&
    !(e.sourceName === "ISM" && feeds.ism?.updatedAt) && !(e.id === "bok-nov" && feeds.krRate?.updatedAt));
  const mergedShow=live ? mergeRecentEvents(feeds.show?.events ?? [],live,now) : feeds.show?.events ?? [];
  const ism=live ? [] : feeds.ism?.events ?? [];
  const show=mergedShow.filter(e=>!ism.some(i=>i.id===e.id));
  const all=upcomingEvents(today,[...manual,...show,...ism,...krMacro.filter(e=>!e.actual),...(feeds.dart?.events ?? [])]).filter(e=>e.country===country);
  const items=all.filter(e=>!e.tentative), tentative=all.filter(e=>e.tentative);
  const recent=(country === "KR"
    ? krMacro.filter(e=>e.actual && e.date>=addDays(today,-6) && e.date<=today)
    : mergedShow.filter(e=>e.time && e.date>=addDays(today,-7) && Date.parse(`${e.date}T${e.time}:00+09:00`)<=now.getTime() && !e.tentative))
    .sort((a,b)=>`${b.date}${b.time ?? ""}`.localeCompare(`${a.date}${a.time ?? ""}`));
  const unknown=(feeds.dart?.companies ?? []).filter(c=>c.status==="확인되지 않음" || c.status==="공시 확인 필요");
  const showUndatedEarnings = country === "KR" && isKoreanEarningsSeason(today);
  const checkedEvents = country === "KR" ? [...manual, ...recent, ...(feeds.dart?.events ?? [])].filter(e => e.country === "KR") : [...recent, ...ism];
  const lastEvent = latestDataTime(checkedEvents.filter(e => !e.tentative && e.date <= today).map(e =>
    e.time ? `${e.date}T${e.time}:00+09:00` : e.date).filter(time => Date.parse(time) <= now.getTime()));
  const updatedAt = latestDataTime(country === "KR" ? [feeds.dart?.updatedAt, ...krMacroFeeds.map(({feed}) => feed?.updatedAt)] : [feeds.show?.updatedAt, feeds.ism?.updatedAt]);
  return <div>
    <header className="mb-6">
      <p className="mb-2 text-xs font-semibold tracking-widest text-rose-300">MARKET CALENDAR</p>
      <h1 className="text-2xl font-semibold tracking-tight">주요 매크로 · 실적 캘린더</h1>
      <p className="mt-2 text-sm text-zinc-400">오늘부터 28일 · 모든 날짜와 시간은 한국시간 (KST)</p>
    </header>
    <DataFreshness basis={lastEvent} updatedAt={updatedAt ?? reviewedAt} basisDetail="최근 확인 일정 · 한국시간(KST)"
      updateDetail={updatedAt ? "저장한 일정 자료 갱신" : "수동 일정 확인일"} />
    <nav aria-label="국가별 캘린더" className="mb-5 flex gap-2 border-b border-white/10">
      {([ ["US","미국 캘린더","/events?country=us"], ["KR","한국 캘린더","/events?country=kr"] ] as const).map(([id,label,href])=><Link key={id} href={href} aria-current={country===id?"page":undefined} className={`border-b-2 px-4 py-3 text-sm font-medium ${country===id?"border-rose-400 text-white":"border-transparent text-zinc-400 hover:text-white"}`}>{label}</Link>)}
    </nav>
    <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
      <p className="font-medium text-white">{today} ~ {end} <span className="ml-2 text-xs font-normal text-zinc-400">오늘 포함 28일</span></p>
    </div>
    <div className="space-y-3">
      {items.length===0 && <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-400">이 기간에 확인된 일정이 없습니다. 실제 일정이 없다는 뜻은 아닙니다.</p>}
      {items.map(event=><article key={event.id} className="grid gap-3 rounded-xl border border-white/10 bg-[#151a22] p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center">
        <div><p className="font-semibold text-zinc-100">{event.date}</p><p className={`mt-1 text-sm ${event.time?"text-zinc-400":"text-amber-300"}`}>{event.time?`${event.time} KST`:"시간 미확정"}</p></div>
        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-rose-950 px-2 py-0.5 text-xs text-rose-200">{event.category}</span><h2 className="font-medium text-white">{title(event)}</h2></div><p className="mt-2 text-sm text-zinc-400">{event.detail}</p>{(event.sourceName === "ShowMyTrades" || (event.country === "KR" && (event.forecast || event.previous))) && values(event,!!event.time && Date.parse(`${event.date}T${event.time}:00+09:00`)<=now.getTime())}</div>
        <a href={event.source} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 underline underline-offset-4 hover:text-white">{event.sourceName} ↗</a>
      </article>)}
    </div>
    <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="font-semibold text-white">최근 발표 결과 · 7일</h2>
      <div className="mt-4 space-y-2">{recent.length === 0 ? <p className="text-sm text-zinc-400">수집된 최근 발표 결과가 없습니다.</p> : recent.map(event=><article key={event.id} className="rounded-md border border-white/10 p-3">
        <p className="text-sm text-white">{title(event)}</p>
        <p className="mt-1 text-xs text-zinc-400">{event.date} {event.time ? `${event.time} KST` : ""} · {event.detail}</p>
        {values(event,true)}
        <a href={event.source} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-zinc-400 underline">{event.sourceName} ↗</a>
      </article>)}</div>
    </section>
    {(country === "US" || showUndatedEarnings || tentative.length > 0) && <section className="mt-8 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
      <h2 className="font-semibold text-white">일정 미확정 · 확인 필요</h2>
      {showUndatedEarnings && <>
        <p className="mt-2 text-xs leading-5 text-zinc-400">DART에서 차기 실적 예정일을 확인하지 못한 상위 기업입니다. 향후 4주 내 발표 예정이라는 뜻은 아닙니다. 최근 실적이 이미 발표되었을 수도 있습니다.</p>
        {!feeds.dart?.updatedAt && <p className="mt-3 text-sm text-amber-300">상위 기업 수집 결과가 없어 미확정 여부를 판단할 수 없습니다.</p>}
        <div className="mt-3 flex flex-wrap gap-2">{unknown.map(c=><span key={c.code} className="rounded border border-white/10 px-3 py-2 text-sm text-zinc-200">{c.name} <span className="text-xs text-amber-300">{c.status}</span>{c.source && <> · <a href={c.source} target="_blank" rel="noreferrer" className="underline">DART</a></>}</span>)}</div>
      </>}
      {(country === "US" || tentative.length > 0) && <><p className="mt-2 text-xs leading-5 text-zinc-400">발표 날짜나 시각을 확인 중인 일정입니다.</p>
        <div className="mt-4 space-y-2">{tentative.length===0 ? <p className="text-sm text-zinc-400">현재 확인된 미확정 예정 일정이 없습니다.</p> : tentative.map(event=><div key={event.id} className="rounded-md border border-white/10 p-3 text-sm"><span className="font-medium text-white">{title(event)}</span><span className="ml-2 text-amber-300">미확정</span><p className="mt-1 text-zinc-400">예상 {event.date} {event.time ? `${event.time} KST` : "· 시간 미확정"} · {event.detail}</p>{event.country === "KR" && (event.forecast || event.previous) && values(event,false)}<a className="mt-1 inline-block text-xs text-zinc-400 underline" href={event.source} target="_blank" rel="noreferrer">{event.sourceName} ↗</a></div>)}</div>
      </>}
    </section>}
    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
      {country==="KR" ? <>
        <p className="mt-2 text-xs leading-5 text-zinc-400">코스피 보통주 시총 상위 30개 기업의 DART 실적 공시예고와 실적 설명회를 매일 16:00 KST 수집합니다. 시총 기준: {feeds.dart?.capAsOf ? `${feeds.dart.capAsOf} KRX 정규장 ${feeds.dart.capAsOf === "2026-11-19" ? "16:30" : "15:30"} 종가` : "확인되지 않음"}.</p>
        {feedStatus("DART · KRX",feeds.dart)}
        <p className="mt-2 text-xs leading-5 text-zinc-400">국내 매크로와 컨센서스는 매일 16:00 KST에 갱신합니다. 일정과 발표값은 한국은행·국가데이터처·관세청에서 수집하며, 이전치는 같은 지표의 직전 기간 발표값입니다.</p>
        {krMacroFeeds.map(({label,feed}) => <div key={label}>{feedStatus(label,feed)}</div>)}
        {feedStatus("컨센서스 · Myfxbook",feeds.krConsensus)}
        <p className="mt-2 text-xs leading-5 text-zinc-400">공시예고가 없으면 날짜를 추측하지 않습니다. 공시와 IR 설명회는 별개이며 정정·취소될 수 있습니다. 발표일이 4주 밖인 일정은 목록에 표시되지 않습니다.</p>
      </> : <>
        <p className="mt-2 text-xs leading-5 text-zinc-400">미국 주요 매크로와 ISM은 ShowMyTrades에서 4시간마다 수집하며, 화면을 열 때도 최신값을 확인합니다. 기업 실적은 수동 확인 ({reviewedAt}) 자료이며 실적 예상치·실제치는 아직 자동 제공하지 않습니다.</p>
        {feedStatus("ShowMyTrades",feeds.show)}{feedStatus("ISM · ShowMyTrades",feeds.ism)}
        <p className="mt-2 text-xs text-zinc-400">예상치는 제공처의 컨센서스입니다. 실제치는 발표 후 갱신되며 일부 값은 제공되지 않을 수 있습니다. 최근 7일 결과는 수집 성공분만 보관합니다. <a className="underline" href="https://showmytrades.com/tools/economic-calendar" target="_blank" rel="noreferrer">Economic calendar by ShowMyTrades ↗</a></p>
      </>}
      <p className="mt-2 text-xs text-amber-300">모든 일정이 포함되는 것은 아니며, 원문을 확인해 주세요.</p>
    </div>
  </div>;
}
