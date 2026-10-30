import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { loadHealth } from "@/lib/view/read";
import { revalidatePath } from "next/cache";
import { ingestQuotes } from "@/lib/ingest/run";

export default function HealthPage() {
  const runs = loadHealth(getDb());
  return (
    <div>
      <PageHeader
        title="수집 상태"
        description="시세 수집은 서버에서만 외부 API 를 호출합니다. 실패해도 마지막 가격은 남고, 여기 로그에 이유가 쌓입니다. 장중 반복은 npm run job:poll, 과거 일봉은 npm run job:backfill 입니다."
      />
      <form
        action={async () => {
          "use server";
          await ingestQuotes(getDb());
          revalidatePath("/", "layout");
        }}
      >
        <button type="submit" className="rounded-md bg-white/10 px-3 py-1.5 text-sm">지금 시세 수집</button>
      </form>
      <ul className="mt-6 space-y-2 text-sm">
        {runs.map((run) => (
          <li key={run.id} className="rounded-lg border border-white/10 px-3 py-2">
            <span className={run.status === "ok" ? "text-emerald-300" : "text-amber-300"}>{run.status}</span>
            <span className="mx-2 text-zinc-500">{run.source}</span>
            <span className="text-zinc-300">{run.message}</span>
            <div className="text-xs text-zinc-500">{run.finishedAt}</div>
          </li>
        ))}
      </ul>
      {!runs.length ? <p className="mt-4 text-sm text-zinc-500">아직 수집 기록이 없습니다.</p> : null}
    </div>
  );
}
