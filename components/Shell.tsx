"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type IconName = "market" | "flow" | "company" | "global";
const groups: { icon: IconName; title: { ko: string; en: string }; items: { href: string; ko: string; en: string }[] }[] = [
  {
    icon: "market", title: { ko: "시장 한눈에", en: "Market overview" },
    items: [
      { href: "/events", ko: "매크로 · 실적 캘린더", en: "Macro & earnings" },
      { href: "/valuation/sectors", ko: "섹터/종목 등락률", en: "Sector & stock performance" },
      { href: "/adr", ko: "코스피 · 코스닥 ADR", en: "KOSPI · KOSDAQ ADR" },
      { href: "/risk", ko: "공포 · 탐욕 지수", en: "Fear & greed" },
    ],
  },
  {
    icon: "flow", title: { ko: "수급 · ETF", en: "Flows & ETFs" },
    items: [
      { href: "/investor-flow/kospi200", ko: "투자자별 수급", en: "Investor flows" },
      { href: "/short-selling", ko: "코스피200 공매도", en: "KOSPI 200 short selling" },
      { href: "/etf-holdings", ko: "ETF 보유 종목", en: "ETF holdings" },
    ],
  },
  {
    icon: "company", title: { ko: "기업 · 종목 분석", en: "Company research" },
    items: [
      { href: "/valuation", ko: "코스피200 밸류에이션", en: "KOSPI 200 valuation" },
      { href: "/valuation/stocks", ko: "개별종목 밸류에이션", en: "Stock valuation" },
      { href: "/financials", ko: "현금 · 재무건전성", en: "Cash & financial health" },
      { href: "/investment-risk", ko: "투자위험", en: "Investment risk" },
      { href: "/minervini", ko: "미너비니 기술적 분석", en: "Minervini analysis" },
    ],
  },
  {
    icon: "global", title: { ko: "글로벌 · 야간 시장", en: "Global & after-hours" },
    items: [
      { href: "/", ko: "글로벌 프록시", en: "Global proxy" },
      { href: "/futures", ko: "글로벌 시장", en: "Global markets" },
      { href: "/single-stock", ko: "단일종목 ETF", en: "Single-stock ETF" },
      { href: "/market-hours", ko: "시장 운영시간", en: "Market hours" },
    ],
  },
];

function SectionIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    market: <><path d="M3 13.5 7 9l3 2.5 5-6" /><path d="M11.5 5.5H15V9" /></>,
    flow: <><path d="M3 6h11m0 0-2-2m2 2-2 2M15 12H4m0 0 2-2m-2 2 2 2" /></>,
    company: <><rect x="3.5" y="3" width="11" height="12" rx="2" /><path d="M6.5 7h5M6.5 10h5M6.5 13h3" /></>,
    global: <><circle cx="9" cy="9" r="6" /><path d="M3.5 9h11M9 3c1.8 1.7 2.7 3.7 2.7 6S10.8 13.3 9 15C7.2 13.3 6.3 11.3 6.3 9S7.2 4.7 9 3Z" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href === "/investor-flow/kospi200" && pathname.startsWith("/investor-flow/"));
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [lang, setLang] = useState<"ko" | "en">("ko");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("dashboard-lang");
    if (saved === "en" || saved === "ko") setLang(saved);
  }, []);

  function toggleLang() {
    const next = lang === "ko" ? "en" : "ko";
    setLang(next);
    window.localStorage.setItem("dashboard-lang", next);
  }
  const current = pathname === "/guide" ? { ko: "리서치보드 사용법", en: "Research board guide" } : groups.flatMap((group) => group.items).find((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-b border-white/[0.08] bg-[#10151c] md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-4 py-4 md:px-5 md:pb-5 md:pt-6">
          <Link href="/" onClick={() => setMenuOpen(false)} className="flex min-w-0 flex-1 items-center gap-3" aria-label={lang === "ko" ? "mk리서치 홈" : "MK Research home"}>
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-[11px] font-extrabold tracking-[-0.06em] text-[#092019]">mk</span>
            <span className="min-w-0"><span className="block text-[15px] font-bold tracking-tight text-zinc-100">{lang === "ko" ? "mk리서치" : "MK Research"}</span><span className="mt-0.5 block text-[10px] tracking-wide text-zinc-500">MARKET RESEARCH</span></span>
          </Link>
          <button type="button" onClick={toggleLang} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400" aria-label={lang === "ko" ? "Switch to English" : "한국어로 전환"}>{lang === "ko" ? "EN" : "KO"}</button>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="main-navigation" aria-label={lang === "ko" ? (menuOpen ? "메뉴 닫기" : "메뉴 열기") : (menuOpen ? "Close menu" : "Open menu")} className="rounded-lg border border-white/10 p-2 text-zinc-300 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-emerald-400 md:hidden">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">{menuOpen ? <path d="m4 4 10 10M14 4 4 14" /> : <path d="M3 5h12M3 9h12M3 13h12" />}</svg>
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2.5 text-xs text-zinc-500 md:hidden"><span>{lang === "ko" ? "현재 화면" : "Current page"}</span><span className="font-medium text-zinc-300">{current?.[lang] ?? (pathname === "/health" ? (lang === "ko" ? "수집 상태" : "Data status") : "mk리서치")}</span></div>
        <nav id="main-navigation" aria-label={lang === "ko" ? "주요 메뉴" : "Main navigation"} className={`${menuOpen ? "block" : "hidden"} border-t border-white/[0.06] px-3 pb-5 pt-2 md:block md:border-t-0 md:px-3 md:pt-0`}>
          <Link href="/guide" onClick={() => setMenuOpen(false)} aria-current={pathname === "/guide" ? "page" : undefined} className={`mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-400 ${pathname === "/guide" ? "bg-emerald-400/10 text-emerald-300" : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"}`}><span aria-hidden="true" className="text-emerald-400">◈</span>{lang === "ko" ? "리서치보드 사용법" : "Research board guide"}</Link>
          {groups.map((group) => (
            <section key={group.icon} className="mb-4">
              <h2 className="flex items-center gap-2 px-2.5 pb-1.5 pt-2 text-[11px] font-semibold tracking-wide text-zinc-500"><span className="text-emerald-400/70"><SectionIcon name={group.icon} /></span>{group.title[lang]}</h2>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return <li key={item.href}><Link href={item.href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} className={`relative block rounded-lg px-3 py-2 text-[13px] leading-5 transition focus-visible:outline-2 focus-visible:outline-emerald-400 ${active ? "bg-emerald-400/10 font-semibold text-emerald-300 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-emerald-400" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"}`}>{item[lang]}</Link></li>;
                })}
              </ul>
            </section>
          ))}
          <div className="mt-5 border-t border-white/[0.07] pt-3"><Link href="/health" onClick={() => setMenuOpen(false)} aria-current={pathname === "/health" ? "page" : undefined} className={`block rounded-lg px-3 py-2 text-xs transition ${pathname === "/health" ? "bg-emerald-400/10 font-semibold text-emerald-300" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"}`}>{lang === "ko" ? "데이터 수집 상태" : "Data status"} <span aria-hidden="true" className="float-right">↗</span></Link></div>
        </nav>
      </aside>
      <div className="min-w-0">
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
        <footer className="px-4 pb-8 text-xs text-zinc-500 md:px-8">정보 제공용이며 투자 권유나 매매 신호가 아닙니다. 시세는 개인 화면용으로만 사용합니다.</footer>
      </div>
    </div>
  );
}
