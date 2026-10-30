"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const groups = [
  {
    title: { ko: "야간 프록시", en: "Global Proxy" },
    items: [{ href: "/", ko: "Global Proxy", en: "Global Proxy" }],
  },
  {
    title: { ko: "시장 지표", en: "Market Gauges" },
    items: [
      { href: "/adr", ko: "등락비율", en: "ADR" },
      { href: "/risk", ko: "위험 지표", en: "Risk Indicators" },
      { href: "/annual-returns", ko: "연간 수익률", en: "Annual Returns" },
    ],
  },
  {
    title: { ko: "컨퍼런스콜", en: "Earnings Calls" },
    items: [{ href: "/concall", ko: "전체 콜", en: "All calls" }],
  },
  {
    title: { ko: "수급", en: "Fund Flows" },
    items: [
      { href: "/fund-flow", ko: "예탁금·신용", en: "Fund Flow" },
      { href: "/etf-flow", ko: "ETF 유출입", en: "ETF Flows" },
      { href: "/etf-constituents", ko: "ETF 비중 변화", en: "ETF Holdings" },
      { href: "/overseas-net-buy", ko: "해외주식 결제", en: "Overseas Net Buy" },
    ],
  },
  {
    title: { ko: "종목·공시", en: "Stocks & Filings" },
    items: [
      { href: "/movers", ko: "52주·등락", en: "52W Highs / Movers" },
      { href: "/dart", ko: "DART", en: "DART" },
      { href: "/trade-stats", ko: "무역 통계", en: "Trade Data" },
    ],
  },
  {
    title: { ko: "AI 교역", en: "AI Trade" },
    items: [
      { href: "/rel-mcap", ko: "상대 시총", en: "Relative Market Cap" },
      { href: "/taiwan-revenue", ko: "대만 월매출", en: "Taiwan Revenue" },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [lang, setLang] = useState<"ko" | "en">("ko");

  useEffect(() => {
    const saved = window.localStorage.getItem("dashboard-lang");
    if (saved === "en" || saved === "ko") setLang(saved);
  }, []);

  function toggleLang() {
    const next = lang === "ko" ? "en" : "ko";
    setLang(next);
    window.localStorage.setItem("dashboard-lang", next);
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-white/10 bg-[#10141b] md:min-h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold tracking-tight">
            {lang === "ko" ? "리서치 보드" : "Research Board"}
          </Link>
          <button type="button" onClick={toggleLang} className="text-xs text-zinc-400" aria-label="Switch language">
            {lang === "ko" ? "EN" : "KO"}
          </button>
        </div>
        <nav className="px-3 pb-6">
          {groups.map((group) => (
            <div key={group.title.ko} className="mb-4">
              <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">{group.title[lang]}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-2 py-1.5 text-sm ${active ? "bg-rose-950 text-rose-100" : "text-zinc-300 hover:bg-white/5"}`}
                        aria-current={active ? "page" : undefined}
                      >
                        {item[lang]}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <Link href="/health" className="block px-2 text-xs text-zinc-500">
            {lang === "ko" ? "수집 상태" : "Health"}
          </Link>
        </nav>
      </aside>
      <div className="min-w-0">
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
        <footer className="px-4 pb-8 text-xs text-zinc-500 md:px-8">
          정보 제공용이며 투자 권유나 매매 신호가 아닙니다. 시세는 개인 화면용으로만 사용합니다.
        </footer>
      </div>
    </div>
  );
}
