import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { formatCompact } from "@/lib/format";
import { loadFilings } from "@/lib/view/read";

const labels: Record<string, string> = {
  earnings: "실적",
  contract: "계약",
  shareholder: "주주환원",
  other: "기타",
};

export default function DartPage() {
  const rows = loadFilings(getDb());
  return (
    <div>
      <PageHeader
        title="DART 공시"
        description="시가총액 1,000억 원 미만은 목록에서 뺍니다. 시총을 아직 모르면 숨기지 않고 미확인으로 남깁니다. 목록 API 에는 본문이 없어 금액 파싱은 대기 상태입니다. 키가 없으면 수집하지 않습니다."
      />
      <div className="space-y-2">
        {rows.map((row) => (
          <article key={row.rceptNo} className="rounded-xl border border-white/10 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">
                {row.corpName} <span className="text-sm text-zinc-500">{labels[row.category] ?? row.category}</span>
              </h2>
              <a className="text-sm text-sky-300" href={row.url}>원문</a>
            </div>
            <p className="mt-1 text-sm text-zinc-300">{row.reportName}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {row.rceptDt} · 파싱 {row.parseStatus === "pending" ? "대기" : row.parseStatus} ·{" "}
              {row.capFilter === "unknown" ? "시총 미확인" : formatCompact(row.marketCapKrw ?? 0, "KRW")}
            </p>
          </article>
        ))}
      </div>
      {!rows.length ? <p className="text-sm text-zinc-500">공시가 없습니다. .env 의 DART_API_KEY 를 넣고 수집을 실행하세요.</p> : null}
    </div>
  );
}
