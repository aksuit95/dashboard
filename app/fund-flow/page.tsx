import { ImportBox } from "@/components/ImportBox";
import { PageHeader } from "@/components/PageHeader";
import { RangeChart } from "@/components/RangeChart";
import { getDb } from "@/lib/db/client";
import { loadFlows } from "@/lib/view/read";

type FlowRow = ReturnType<typeof loadFlows>[number];

function latestValue(rows: FlowRow[], pick: (row: FlowRow) => number | null): { date: string | null; value: number | null } {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = pick(rows[index]);
    if (value != null) return { date: rows[index].date, value };
  }
  return { date: null, value: null };
}

function tradingTotal(row: FlowRow): number | null {
  if (row.kospi == null && row.kosdaq == null) return null;
  return (row.kospi ?? 0) + (row.kosdaq ?? 0);
}

export default function FundFlowPage() {
  const rows = loadFlows(getDb());
  const deposits = latestValue(rows, (row) => row.deposits);
  const credit = latestValue(rows, (row) => row.credit);
  const creditPct = latestValue(rows, (row) => row.creditPct);
  const trading = latestValue(rows, tradingTotal);
  return (
    <div>
      <PageHeader
        title="증시 자금"
        description="예탁금과 신용잔고는 네이버 증시자금의 발표일을 그대로 씁니다. 협회 통계라 보통 2거래일 늦고, 그 날짜를 거래일로 당기지 않습니다. 금액 단위는 억 원입니다. 거래대금은 같은 날 코스피·코스닥 지수 대금의 합입니다. 신용잔고를 나눌 전체 시총은 아직 없어서 비율은 비웁니다."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="예탁금" date={deposits.date} value={deposits.value} />
        <Metric label="신용잔고" date={credit.date} value={credit.value} />
        <Metric label="신용/시총 %" date={creditPct.date} value={creditPct.value} plain />
        <Metric label="거래대금" date={trading.date} value={trading.value} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="예탁금 (억 원)"><RangeChart points={rows.filter((row) => row.deposits != null).map((row) => ({ date: row.date, value: row.deposits as number }))} digits={0} /></Panel>
        <Panel title="신용잔고 (억 원)"><RangeChart points={rows.filter((row) => row.credit != null).map((row) => ({ date: row.date, value: row.credit as number }))} color="#38bdf8" digits={0} /></Panel>
      </div>
      <div className="mt-6">
        <ImportBox
          kind="flow"
          hint="date, deposits, credit_balance, credit_mcap_pct, kospi_value, kosdaq_value. 금액은 억 원이고 빈 칸은 결측입니다."
          sample={"date,deposits,credit_balance,credit_mcap_pct,kospi_value,kosdaq_value\n2026-10-27,500000,230000,0.49,120000,40000"}
        />
      </div>
    </div>
  );
}

function Metric({ label, date, value, plain = false }: { label: string; date: string | null; value: number | null; plain?: boolean }) {
  const text = value == null ? "—" : plain ? value.toLocaleString("ko-KR") : `${Math.round(value).toLocaleString("ko-KR")}억`;
  return (
    <div className="rounded-xl border border-white/10 bg-[#151a22] p-4">
      <div className="text-xs text-zinc-500">{label}{date ? ` ${date}` : ""}</div>
      <div className="mt-1 text-xl tabular-nums">{text}</div>
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
