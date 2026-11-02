"use client";

import { useEffect, useMemo, useState } from "react";
import { CALENDAR_YEAR } from "@/config/market-calendar";
import { MARKETS, calendarNote, daySessions, localDate, marketStatus, remainingText, shiftDate, timeText, zonedTime, type Phase, type TradingSession } from "@/lib/market/market-hours";

const tones: Record<Phase, string> = { overnight: "#22d3ee", pre: "#38bdf8", regular: "#34d399", after: "#a78bfa", auction: "#fbbf24", closing: "#fb923c" };
const legends: [Phase, string][] = [["overnight", "주간거래 / 오버나이트"], ["pre", "프리마켓"], ["regular", "정규 / 본장"], ["after", "애프터마켓"], ["auction", "동시호가·접수"], ["closing", "종가매매"]];

function sessionRange(s: TradingSession, date: string) {
  const from = localDate(s.start) < date ? "전일 " : "";
  const to = localDate(s.end) > date ? "익일 " : "";
  const withSeconds = new Date(s.start).getUTCSeconds() !== 0;
  return `${from}${timeText(s.start, "Asia/Seoul", withSeconds)}–${to}${timeText(s.end)}`;
}

export function MarketHoursBoard() {
  const [now, setNow] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<TradingSession | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const today = now === null ? "" : localDate(now);
  const date = today ? shiftDate(today, offset) : "";
  const sessions = useMemo(() => date ? daySessions(date) : [], [date]);
  const statuses = useMemo(() => now === null ? [] : MARKETS.map(m => ({ ...m, ...marketStatus(m.id, now) })), [now]);
  if (now === null) return <div className="h-80 animate-pulse rounded-2xl border border-white/10 bg-[#151a22]" role="status" aria-label="시장 시간표 불러오는 중" />;
  const start = zonedTime(date, 0, "Asia/Seoul");
  const end = start + 86_400_000;
  const cursor = (now - start) / (end - start) * 100;
  const openCount = statuses.filter(s => s.active.length).length;
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(start);
  const dst = timeText(zonedTime(localDate(now, "America/New_York"), 570, "America/New_York")) === "22:30";
  return <div className="space-y-5">
    <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-white/10 bg-gradient-to-br from-[#19262a] to-[#151a22] p-5 sm:p-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE SESSION CLOCK</div>
        <div className="mt-2 flex items-baseline gap-3"><span className="font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{timeText(now, "Asia/Seoul", true)}</span><span className="text-sm text-zinc-400">KST</span></div>
        <p className="mt-2 text-xs text-zinc-400">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "full" }).format(now)} · 1초마다 갱신</p>
      </div>
      <div className="flex gap-7 text-sm">
        <div><p className="text-xs text-zinc-500">현재 운영 중</p><p className="mt-1 text-xl font-semibold">{openCount}<span className="ml-1 text-sm font-normal text-zinc-500">/ 3 시장</span></p></div>
        <div><p className="text-xs text-zinc-500">뉴욕 현지 시각</p><p className="mt-1 font-mono text-xl tabular-nums">{timeText(now, "America/New_York", true)}</p><p className="mt-1 text-xs text-zinc-500">{localDate(now, "America/New_York")} · {dst ? "EDT" : "EST"}</p></div>
      </div>
    </section>

    <div className="grid gap-3 lg:grid-cols-3">
      {statuses.map(m => {
        const current = m.active[0];
        const deadline = current?.end ?? m.next?.start;
        return <article key={m.id} className="rounded-xl border border-white/10 bg-[#151a22] p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{m.name}</h2><span className={`rounded-full px-2 py-1 text-[11px] ${current ? "bg-emerald-400/10 text-emerald-300" : m.uncertain ? "bg-amber-400/10 text-amber-300" : "bg-white/5 text-zinc-400"}`}>{current ? "진행 중" : m.uncertain ? "확인 필요" : "거래 대기"}</span></div>
          <p className="mt-1 text-xs text-zinc-500">{m.subtitle}</p>
          <p className="mt-5 min-h-7 text-lg font-medium" style={{ color: current ? tones[current.phase] : undefined }}>{current ? m.active.map(s => s.label).join(" · ") : m.note ?? "세션 사이 휴식 / 장 마감"}</p>
          <p className="mt-2 font-mono text-sm tabular-nums text-zinc-300">{deadline && !m.uncertain ? `${remainingText(deadline - now)} ${current ? "후 종료" : "후 시작"}` : "공식 운영 공지를 확인하세요"}</p>
          <p className="mt-3 text-xs text-zinc-500">{current ? `한국 시간 ${sessionRange(current, today)}` : m.next ? `다음: ${localDate(m.next.start)} ${timeText(m.next.start)} ${m.next.label}` : "다음 일정 업데이트 필요"}</p>
        </article>;
      })}
    </div>

    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#151a22]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div><h2 className="font-semibold">하루의 시장 흐름</h2><p className="mt-1 text-xs text-zinc-500">{dateLabel} · 모든 막대는 한국 시간 기준</p></div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="전날 보기" onClick={() => { setOffset(o => o - 1); setSelected(null); }} className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">‹</button>
          <button type="button" onClick={() => { setOffset(0); setSelected(null); }} className={`rounded-lg border border-white/10 px-3 py-1.5 text-xs ${offset === 0 ? "text-emerald-300" : "text-zinc-300 hover:bg-white/5"}`}>오늘</button>
          <button type="button" aria-label="다음 날 보기" onClick={() => { setOffset(o => o + 1); setSelected(null); }} className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">›</button>
        </div>
      </div>
      <div className="overflow-x-auto px-5 pb-3 pt-9">
        <div className="min-w-[740px]">
          <div className="ml-28 grid grid-cols-8 pb-3 font-mono text-[10px] text-zinc-500">{[0, 3, 6, 9, 12, 15, 18, 21].map(h => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}</div>
          <div className="relative">
            {cursor >= 0 && cursor < 100 && <div className="pointer-events-none absolute bottom-0 top-0 z-20" style={{ left: `calc(112px + (100% - 112px) * ${cursor / 100})` }}><div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap rounded bg-rose-400 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#11151c]">{timeText(now)}</div><div className="h-full border-l border-rose-400/80" /></div>}
            {MARKETS.map(m => {
              const visible = sessions.filter(s => s.market === m.id && s.end > start && s.start < end);
              const note = calendarNote(m.id, m.id === "us" ? localDate(start + 18 * 3600_000, m.zone) : date);
              return <div key={m.id} className="flex min-h-28 items-center border-t border-white/5">
                <div className="w-28 shrink-0"><div className="text-sm font-semibold">{m.name}</div><p className="mt-1 text-[10px] text-zinc-500">{m.id === "us" ? "주간 / PRE / MAIN / AFTER" : m.id === "nxt" ? "대체거래소" : "한국거래소"}</p></div>
                <div className="relative h-24 flex-1" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.055) 1px, transparent 1px)", backgroundSize: "12.5% 100%" }}>
                  <div className="absolute inset-x-0 top-5 h-8 rounded-md bg-white/[0.025]" />
                  {!visible.length && <p className="absolute inset-x-0 top-7 text-center text-xs text-zinc-500">{note ?? "거래 세션 없음"}</p>}
                  {visible.map(s => {
                    const left = Math.max(0, (s.start - start) / (end - start) * 100);
                    const width = (Math.min(end, s.end) - Math.max(start, s.start)) / (end - start) * 100;
                    const active = s.start <= now && now < s.end;
                    return <button key={`${s.label}-${s.start}`} type="button" title={`${s.label} · ${sessionRange(s, date)} KST`} aria-label={`${m.name} ${s.label}, 한국 시간 ${sessionRange(s, date)}${active ? ", 진행 중" : ""}`} onClick={() => setSelected(s)} className="absolute overflow-hidden rounded border text-left transition-[filter] hover:brightness-125 focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" style={{ left: `${left}%`, width: `${width}%`, top: s.lane ? 60 : 20, height: s.lane ? 20 : 32, background: `${tones[s.phase]}${active ? "55" : "25"}`, borderColor: `${tones[s.phase]}${active ? "ee" : "55"}`, color: tones[s.phase], boxShadow: active ? `0 0 18px ${tones[s.phase]}18` : undefined }}>
                      {width > 8 && <span className="block truncate px-2 text-[11px] font-medium">{active ? "● " : ""}{s.label}</span>}
                    </button>;
                  })}
                </div>
              </div>;
            })}
          </div>
          <div className="ml-28 flex justify-between pt-2 font-mono text-[10px] text-zinc-600"><span>00:00</span><span>24:00</span></div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 py-4">{legends.map(([phase, label]) => <span key={phase} className="flex items-center gap-2 text-[11px] text-zinc-400"><span className="h-2 w-2 rounded-sm" style={{ background: tones[phase] }} />{label}</span>)}</div>
      <p className="px-5 pb-4 text-xs leading-relaxed text-zinc-400"><span className="text-cyan-300">미국 주간거래 (Blue Ocean ATS)</span> · 한국 시간 월–금 10:00–18:00 / 서머타임 09:00–17:00. 미국 휴장일 제외, 증권사별 지원 시간·종목은 다를 수 있습니다.</p>
      <div className="border-t border-white/5 px-5 py-3 text-xs text-zinc-400" aria-live="polite">{selected ? <span><strong className="text-zinc-200">{MARKETS.find(m => m.id === selected.market)?.name} · {selected.label}</strong><span className="ml-3">{sessionRange(selected, date)} KST{selected.market === "us" ? ` / 뉴욕 ${timeText(selected.start, "America/New_York")}–${timeText(selected.end, "America/New_York")}` : ""}</span></span> : "막대를 누르면 세션의 정확한 거래시간을 확인할 수 있습니다. 작은 구간은 동시호가·종가매매입니다."}</div>
    </section>

    <details className="rounded-xl border border-white/10 px-5 py-4 text-xs text-zinc-400">
      <summary className="cursor-pointer text-zinc-300">시간표 기준 및 반영 범위</summary>
      <div className="mt-4 space-y-2 leading-relaxed">
        <p>PC 시각과 거래 일정으로 계산하는 세션 시계입니다. {CALENDAR_YEAR}년 주말·공휴일·미국 본장 조기폐장을 반영하며, 미국 서머타임은 뉴욕 시간대로 자동 전환합니다. 임시 휴장·거래정지 등 실시간 거래소 상태는 연결하지 않습니다.</p>
        <p>KRX: 09:00–15:30 정규장(15:20부터 종가 동시호가), 15:40–16:00 시간외종가, 16:00–20:00 애프터마켓. 시가 단일가 주문접수는 08:30부터이며 장전 시간외종가와 겹칩니다.</p>
        <p>NXT: 08:00–08:50 프리마켓, 09:00:30–15:20 메인마켓, 15:30–16:00 종가매매, 16:00–20:00 애프터마켓. 거래 가능한 종목은 시장별로 다릅니다.</p>
        <p>미국: 뉴욕 04:00–09:30 프리마켓, 09:30–16:00 본장, 16:00–20:00 애프터마켓. 시간외는 Nasdaq 기준이며 증권사별 지원 시간이 다릅니다. 조기폐장일의 시간외는 별도 공지 확인이 필요합니다. 수능일 등 미확인 특별 일정은 확인 필요로 표시합니다.</p>
        <p>미국 주간거래는 Blue Ocean ATS의 뉴욕 일–목 20:00부터 다음 날 04:00까지를 표시합니다. 다음 날 미국 거래일을 기준으로 휴장 여부를 판단하므로 한국 월요일 낮에는 열리고 토요일 낮에는 열리지 않습니다. 공휴일 밤에도 다음 거래일이 정상 운영일이면 다음 날 주간거래가 표시됩니다. 실제 주문 가능 시간은 이용 증권사 기준을 확인하세요.</p>
        <p><a className="underline hover:text-white" href="https://my.blueocean-tech.io/faq/how-does-blue-oceanats-operate" target="_blank" rel="noreferrer">Blue Ocean ATS 운영시간·거래일 기준</a> · <a className="underline hover:text-white" href="https://blueocean-tech.io/trading-updates/" target="_blank" rel="noreferrer">ATS 휴장 일정</a></p>
        <p className="pt-1">기준 확인: 2026-11-02 · <a className="underline hover:text-white" href="https://www.kbsec.com/go.able?idt=20260904&linkcd=s060901010000&seq=10010298" target="_blank" rel="noreferrer">KRX·NXT 개편 안내</a> · <a className="underline hover:text-white" href="https://www.myasset.com/myasset/static/trading/TR_1608001_T1.jsp?forcetm=w&gnbHide=" target="_blank" rel="noreferrer">국내 거래시간</a> · <a className="underline hover:text-white" href="https://nasdaqtrader.com/Trader.aspx?id=Calendar" target="_blank" rel="noreferrer">미국 거래 캘린더</a> · <a className="underline hover:text-white" href="https://www.nasdaq.com/market-activity/stock-market-holiday-schedule" target="_blank" rel="noreferrer">미국 거래시간</a> · <a className="underline hover:text-white" href="https://www.kasi.re.kr/kor/post/newsMaterial/32031" target="_blank" rel="noreferrer">한국 공휴일</a></p>
      </div>
    </details>
  </div>;
}
