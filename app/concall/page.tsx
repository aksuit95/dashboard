import { ImportBox } from "@/components/ImportBox";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { loadConcalls } from "@/lib/view/read";

export default function ConcallPage() {
  const rows = loadConcalls(getDb());
  return (
    <div>
      <PageHeader title="실적 컨퍼런스콜" description="회사 IR 일정을 JSON 으로 넣습니다. 다시 가져오면 목록 전체를 교체합니다. 자동 수집은 하지 않습니다." />
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">제목</th>
              <th className="px-3 py-2 text-left font-medium">일시</th>
              <th className="px-3 py-2 text-left font-medium">분기</th>
              <th className="px-3 py-2 text-left font-medium">자료</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.heldAt}-${row.title}`} className="border-t border-white/10">
                <td className="px-3 py-2">{row.title}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.heldAt}</td>
                <td className="px-3 py-2">{row.period}</td>
                <td className="px-3 py-2">
                  <a className="text-sky-300" href={row.url}>보기</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <p className="mt-4 text-sm text-zinc-500">등록된 콜이 없습니다.</p> : null}
      <div className="mt-6">
        <ImportBox
          kind="concall"
          hint='JSON 배열. 필드 title, heldAt, period, url'
          sample={'[{"title":"삼성전자 3Q26","heldAt":"2026-10-29T10:00:00+09:00","period":"3Q26","url":"https://example.com"}]'}
        />
      </div>
    </div>
  );
}
