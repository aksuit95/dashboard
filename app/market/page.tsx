import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { fetchTodayEvents } from "@/lib/sources/google-calendar";
import { fetchNaverNews } from "@/lib/sources/naver-news";
import { formatPlain, loadNaverIndexes } from "@/lib/view/read";

export default async function MarketPage() {
  const indexes = loadNaverIndexes(getDb());
  const news = await fetchNaverNews("증시");
  const calendar = await fetchTodayEvents();

  return (
    <div className="space-y-6">
      <PageHeader
        title="시황·뉴스"
        description="챗봇과 같은 네이버 지수, 네이버 클라우드 뉴스, 구글 캘린더 읽기입니다. 뉴스와 일정은 화면을 열 때 가져오고, 지수는 마지막 성공 수집을 유지합니다."
      />

      <section>
        <h2 className="mb-2 font-medium">네이버 지수</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {indexes.map((index) => (
            <article key={index.itemCode} className="rounded-xl border border-white/10 bg-[#151a22] px-4 py-3">
              <p className="text-sm text-zinc-400">{index.name}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPlain(index.price)}</p>
              <p className={`mt-1 text-sm tabular-nums ${tone(index.changePct)}`}>
                {index.changePct == null ? "등락 없음" : `${index.changePct > 0 ? "+" : ""}${index.changePct.toFixed(2)}%`}
              </p>
            </article>
          ))}
        </div>
        {!indexes.length ? <p className="text-sm text-zinc-500">아직 수집된 네이버 지수가 없습니다. npm run job:ingest 를 실행하세요.</p> : null}
      </section>

      <section>
        <h2 className="mb-2 font-medium">증시 뉴스</h2>
        {news.status === "ok" ? (
          <ol className="space-y-2">
            {news.data.map((item) => (
              <li key={item.link} className="rounded-xl border border-white/10 px-4 py-3">
                <a className="text-sky-300" href={item.link} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500">{news.message}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">오늘 일정</h2>
        {calendar.status === "ok" ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">{calendar.data.label}</p>
            {calendar.data.events.map((event) => (
              <article key={`${event.calendarName}-${event.when}-${event.title}`} className="rounded-xl border border-white/10 px-4 py-3">
                <p className="text-xs text-zinc-500">{event.calendarName}</p>
                <p className="mt-1">
                  <span className="tabular-nums text-zinc-400">{event.when}</span> {event.title}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{calendar.message}</p>
        )}
      </section>
    </div>
  );
}

function tone(value: number | null): string {
  if (value == null || value === 0) return "text-zinc-400";
  return value > 0 ? "text-rose-300" : "text-sky-300";
}
