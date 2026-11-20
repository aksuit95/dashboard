import { krxCloseTime } from "@/config/market-calendar";

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});
const seoulClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function krxCloseDetail(date: string | null | undefined) {
  return date ? `KRX 정규장 ${krxCloseTime(date)} KST 종가` : "KRX 정규장 종가";
}

export { latestDataTime } from "@/lib/format";

function FreshnessField({ label, value, detail }: { label: string; value?: string | null; detail?: string }) {
  const time = value ? Date.parse(value) : NaN;
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <dt className="text-xs font-medium text-slate-300">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-50 sm:text-base">
        {value && Number.isFinite(time) ? (
          <time dateTime={value}>{dateOnly.test(value) ? value : `${seoulDate.format(time)} ${seoulClock.format(time)} KST`}</time>
        ) : <span className="font-medium text-slate-400">미확인</span>}
      </dd>
      {detail && <dd className="mt-0.5 text-xs text-slate-300">{detail}</dd>}
    </div>
  );
}

export function DataFreshness({ basis, updatedAt, basisDetail, updateDetail }: {
  basis?: string | null;
  updatedAt?: string | null;
  basisDetail?: string;
  updateDetail?: string;
}) {
  return (
    <dl aria-label="데이터 기준 및 업데이트" className="mb-5 grid overflow-hidden rounded-xl border border-slate-600/60 bg-[#18222e] divide-y divide-slate-600/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      <FreshnessField label="최신 데이터 기준" value={basis} detail={basisDetail} />
      <FreshnessField label="업데이트 시간" value={updatedAt} detail={updateDetail} />
    </dl>
  );
}
