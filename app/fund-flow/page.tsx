import { ImportBox } from "@/components/ImportBox";
import { PageHeader } from "@/components/PageHeader";
import { RangeChart } from "@/components/RangeChart";
import { getDb } from "@/lib/db/client";
import { loadFlows } from "@/lib/view/read";

export default function FundFlowPage() {
  const rows = loadFlows(getDb());
  const latest = rows.at(-1);
  return (
    <div>
      <PageHeader
        title="증시 자금"
        description="예탁금과 신용잔고는 금융투자협회 기준일 때 보통 2거래일 지연입니다. 이 화면은 가져온 표의 날짜를 그대로 보여 주며, 지연 일수를 임의로 보정하지 않습니다."
      />
      {latest ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="예탁금" value={latest.deposits} />
          <Metric label="신용잔고" value={latest.credit} />
          <Metric label="신용/시총 %" value={latest.creditPct} />
          <Metric label={`거래대금 ${latest.date}`} value={(latest.kospi ?? 0) + (latest.kosdaq ?? 0)} />
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">자금 데이터가 없습니다.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="예탁금"><RangeChart points={rows.filter((row) => row.deposits != null).map((row) => ({ date: row.date, value: row.deposits as number }))} /></Panel>
        <Panel title="신용잔고"><RangeChart points={rows.filter((row) => row.credit != null).map((row) => ({ date: row.date, value: row.credit as number }))} color="#38bdf8" /></Panel>
      </div>
      <div className="mt-6">
        <ImportBox
          kind="flow"
          hint="date, deposits, credit_balance, credit_mcap_pct, kospi_value, kosdaq_value. 빈 칸은 결측입니다."
          sample={"date,deposits,credit_balance,credit_mcap_pct,kospi_value,kosdaq_value\n2026-10-27,500000,230000,0.49,120000,40000"}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl tabular-nums">{value == null ? "—" : value.toLocaleString("ko-KR")}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#151a22] p-4">
      <h2 className="mb-2 text-sm text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}
