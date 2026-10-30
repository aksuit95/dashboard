import { ImportBox } from "@/components/ImportBox";
import { OverseasTable } from "@/components/OverseasTable";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/db/client";
import { loadOverseas } from "@/lib/view/read";

export default function OverseasPage() {
  const db = getDb();
  const tables = {
    daily: loadOverseas(db, "daily"),
    monthly: loadOverseas(db, "monthly"),
    ytd: loadOverseas(db, "ytd"),
    yearly: loadOverseas(db, "yearly"),
  };
  return (
    <div>
      <PageHeader
        title="해외주식 결제 순매수"
        description="국내 투자자의 미국 주식 결제 순위입니다. 체결이 아닙니다. 안정적인 무료 API 가 없어 CSV 로 넣습니다. 같은 구간과 기준일을 다시 올리면 그 배치만 바뀝니다."
      />
      <OverseasTable tables={tables} />
      <div className="mt-6">
        <ImportBox
          kind="overseas"
          hint="window, as_of, rank, name, buy, sell, net"
          sample={"window,as_of,rank,name,buy,sell,net\ndaily,2026-10-28,1,Example Inc,100,20,80"}
        />
      </div>
    </div>
  );
}
