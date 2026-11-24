"use client";

import { useState } from "react";
import { NumberInput } from "@/components/IndexTechnicalSettings";
import { indexEventLabels, indexEventTypes, type IndexBacktest, type IndexBacktests, type IndexBacktestSettings, type IndexEventType, type IndexHorizons } from "@/lib/market/index-backtest";
import type { IndexRules } from "@/lib/market/index-rules";
import { timeframeLabels, type IndexTimeframe } from "@/lib/market/index-timeframe";

type Horizon = IndexBacktest["horizons"][number];
const number = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedNumber = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });
const pct = (value: number | undefined) => value === undefined ? "—" : `${number.format(Math.abs(value) < 0.005 ? 0 : value)}%`;
const count = (n: number) => n.toLocaleString("ko-KR");
const select = "mt-1 w-full rounded-md border border-white/15 bg-[#10151c] px-2.5 py-1.5 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-400";

function ruleSummary(rules: IndexRules, settings: IndexBacktestSettings) {
  const { event } = settings;
  if (event === "disparity-low" || event === "disparity-high") {
    const cutoff = event === "disparity-low" ? `P${rules.pctlLower} 이하` : `P${rules.pctlUpper} 이상`;
    const sample = rules.pctlLookback === "all" ? "전체 이력" : `최근 ${rules.pctlLookback}봉`;
    const mode = rules.expanding ? "시점별 갱신" : `고정 기준일 ${rules.calibrationEnd ?? "미선택"}`;
    return `${rules.maPeriods[settings.maSlot]}봉 이격도 · ${cutoff} · ${sample} · ${mode}`;
  }
  if (event === "rsi-low" || event === "rsi-high") return `RSI(14) ${event === "rsi-low" ? `${settings.rsiLower} 이하` : `${settings.rsiUpper} 이상`}`;
  return `직전 완료 봉까지 확정된 ${event === "support-near" ? "지지선" : "저항선"} ±${settings.proximityPct}% · 좌우 ${rules.swingN}봉 · 탐지 ${rules.lookbackBars}봉 · 묶음 ${rules.clusterTolPct}% · 최소 ${rules.minTouches}회 · 최근접 ${rules.maxLevels}개`;
}

function Warnings({ row }: { row: Horizon }) {
  const sampleShortage = (row.signal?.count ?? 0) < 30;
  if (!sampleShortage && !row.overlap) return <span className="text-zinc-500">—</span>;
  return <>
    {sampleShortage && <span className="block whitespace-nowrap text-amber-300">표본 부족</span>}
    {row.overlap && <span className="block whitespace-nowrap text-amber-300">겹침 있음</span>}
  </>;
}

function Difference({ value }: { value: number | undefined }) {
  const rounded = value !== undefined && Math.abs(value) < 0.005 ? 0 : value;
  const tone = rounded === undefined || rounded === 0 ? "text-zinc-400" : rounded > 0 ? "text-rose-300" : "text-sky-300";
  return <td className={`whitespace-nowrap px-3 py-2 text-right ${tone}`}>{rounded === undefined ? "—" : signedNumber.format(rounded)}</td>;
}

function SignalComparison({ context, results, rules, settings }: { context: string; results: IndexBacktests; rules: IndexRules; settings: IndexBacktestSettings }) {
  return <section aria-labelledby="index-backtest-comparison" className="mt-5 border-t border-white/10 pt-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="index-backtest-comparison" className="text-sm font-semibold text-zinc-100">6개 신호 비교</h3>
      <span className="text-xs text-zinc-400">{context}</span>
    </div>
    <p className="mb-3 mt-1 text-xs leading-relaxed text-zinc-400">신호 발생 봉의 통계에서 같은 기간 전체 봉의 통계를 뺀 값입니다. 각 신호의 판정 가능 기간을 기준으로 비교합니다.</p>
    <div className="overflow-x-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label="6개 신호 비교표">
      <table className="w-full min-w-[655px] text-xs tabular-nums" aria-label="6개 신호의 전체 봉 대비 차이">
        <thead className="bg-white/[0.04] text-zinc-300"><tr>
          <th scope="col" className="px-3 py-2.5 text-left font-medium">신호 · 총 발생</th>
          <th scope="col" className="px-3 py-2.5 text-left font-medium">이후 기간</th>
          <th scope="col" className="px-3 py-2.5 text-right font-medium">표본 수 (신호 / 전체)</th>
          <th scope="col" className="px-3 py-2.5 text-right font-medium">평균 차이 (%p)</th>
          <th scope="col" className="px-3 py-2.5 text-right font-medium">중앙값 차이 (%p)</th>
          <th scope="col" className="px-3 py-2.5 text-right font-medium">승률 차이 (%p)</th>
          <th scope="col" className="px-3 py-2.5 text-left font-medium">상태</th>
        </tr></thead>
        {indexEventTypes.map(event => {
          const result = results[event];
          return <tbody key={event} className="border-t border-white/10">
            {result.horizons.map((row, i) => {
              const { signal, baseline, horizon, start, end } = row;
              return <tr key={horizon} className="hover:bg-white/[0.04]">
                {i === 0 && <th scope="rowgroup" rowSpan={result.horizons.length} title={ruleSummary(rules, { ...settings, event })}
                  className="px-3 py-2 text-left align-middle font-medium text-zinc-100">
                  {indexEventLabels[event]}<span className="mt-1 block text-zinc-400">{count(result.events.length)}회</span>
                </th>}
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-zinc-300">{horizon}봉</th>
                <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-300" title={start && end ? `${start} ~ ${end} 수익률 시작일` : undefined}>
                  {count(signal?.count ?? 0)} / {count(baseline?.count ?? 0)}
                </td>
                <Difference value={signal && baseline ? signal.average - baseline.average : undefined} />
                <Difference value={signal && baseline ? signal.median - baseline.median : undefined} />
                <Difference value={signal && baseline ? signal.winRate - baseline.winRate : undefined} />
                <td className="px-3 py-2"><Warnings row={row} /></td>
              </tr>;
            })}
          </tbody>;
        })}
      </table>
    </div>
  </section>;
}

function Distribution({ row }: { row: Horizon }) {
  if (!row.bins.length) return <p className="rounded-lg border border-white/10 px-4 py-7 text-sm text-zinc-400">비교할 완료 수익률 구간이 아직 없습니다.</p>;
  const signalSize = row.signal?.count ?? 0;
  const baselineSize = row.baseline?.count ?? 0;
  const frequencies = row.bins.map(bin => ({ ...bin, signalPct: signalSize ? bin.signal / signalSize * 100 : 0,
    baselinePct: baselineSize ? bin.baseline / baselineSize * 100 : 0 }));
  const peak = Math.max(...frequencies.flatMap(bin => [bin.signalPct, bin.baselinePct]));
  const scale = Math.min(100, Math.ceil(peak / 10) * 10);

  return <figure className="rounded-lg border border-white/10 p-3 sm:p-4">
    <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
      <span className="font-medium text-zinc-100">{row.horizon}봉 후 수익률 · 구간별 표본 비중</span>
      <span className="flex flex-wrap gap-3"><span className="text-emerald-300">■ 신호 발생 봉</span><span className="text-slate-300">■ 같은 기간 전체 봉</span></span>
    </figcaption>
    <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 text-[10px] tabular-nums text-zinc-400">
      <div className="flex h-32 flex-col justify-between text-right" aria-hidden="true"><span>{scale}%</span><span>0%</span></div>
      <div className="relative grid h-32 grid-cols-[repeat(16,minmax(0,1fr))] border-y border-white/10" role="img" aria-label={`${row.horizon}봉 이후 수익률. 신호 발생 봉 ${signalSize}개, 전체 봉 ${baselineSize}개.`}>
        <span className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-white/30" aria-hidden="true" />
        {frequencies.map(bin => <div key={bin.lower} className="relative flex h-full items-end justify-center hover:bg-white/10"
          title={`${pct(bin.lower)} ~ ${pct(bin.upper)} · 신호 ${bin.signal}개 (${pct(bin.signalPct)}) · 전체 ${bin.baseline}개 (${pct(bin.baselinePct)})`}>
          <span className="w-[82%] bg-slate-400/45" style={{ height: `${bin.baselinePct / scale * 100}%` }} />
          <span className="absolute bottom-0 w-[48%] bg-emerald-400/80" style={{ height: `${bin.signalPct / scale * 100}%` }} />
        </div>)}
      </div>
      <div className="col-start-2 mt-1 grid grid-cols-3"><span>{pct(frequencies[0].lower)}</span><span className="text-center">0%</span><span className="text-right">{pct(frequencies.at(-1)!.upper)}</span></div>
    </div>
    <p className="mt-2 text-xs text-zinc-400">수익률 시작일 {row.start} ~ {row.end}</p>
  </figure>;
}

function Stats({ stats }: { stats: Horizon["signal"] }) {
  return <>
    <td className="px-2 py-2 text-right">{count(stats?.count ?? 0)}</td>
    {[stats?.average, stats?.median, stats?.winRate, stats?.p25, stats?.p75, stats?.min, stats?.max].map((value, i) =>
      <td key={i} className="whitespace-nowrap px-2 py-2 text-right">{pct(value)}</td>)}
  </>;
}

export function IndexBacktestPanel({ name, timeframe, rules, settings, results, showMarkers, onChange, onMarkers }: {
  name: string; timeframe: IndexTimeframe; rules: IndexRules; settings: IndexBacktestSettings; results: IndexBacktests;
  showMarkers: boolean; onChange: (settings: IndexBacktestSettings) => void; onMarkers: (show: boolean) => void;
}) {
  const [selectedHorizon, setSelectedHorizon] = useState(0);
  const { event } = settings;
  const result = results[event];
  const row = result.horizons[selectedHorizon];
  const disparity = event === "disparity-low" || event === "disparity-high";
  const proximity = event === "support-near" || event === "resistance-near";

  return <section id="index-backtest" aria-labelledby="index-backtest-heading" className="scroll-mt-4 rounded-xl border border-white/10 bg-[#151a22] p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="index-backtest-heading" className="font-semibold text-zinc-100">과거 신호 검증</h2>
      <span className="text-sm text-zinc-300">{name} {timeframeLabels[timeframe]} · 신호 <strong className="tabular-nums text-emerald-300">{count(result.events.length)}회</strong></span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <label className="col-span-2 text-xs text-zinc-300 sm:col-span-1">이벤트 유형
        <select className={select} value={event} onChange={e => onChange({ ...settings, event: e.target.value as IndexEventType })}>
          {Object.entries(indexEventLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {disparity && <label className="text-xs text-zinc-300">검증할 이격도 이동평균
        <select className={select} value={settings.maSlot} onChange={e => onChange({ ...settings, maSlot: Number(e.target.value) })}>
          {rules.maPeriods.map((period, i) => <option key={period} value={i}>{period}봉</option>)}
        </select>
      </label>}
      {event === "rsi-low" && <NumberInput label="RSI 과매도 임계치" value={settings.rsiLower} limits={[0, settings.rsiUpper - 1]} onChange={rsiLower => onChange({ ...settings, rsiLower })} />}
      {event === "rsi-high" && <NumberInput label="RSI 과매수 임계치" value={settings.rsiUpper} limits={[settings.rsiLower + 1, 100]} onChange={rsiUpper => onChange({ ...settings, rsiUpper })} />}
      {proximity && <NumberInput label="레벨 근접 범위 (±%)" value={settings.proximityPct} limits={[0.1, 20]} step={0.1} onChange={proximityPct => onChange({ ...settings, proximityPct })} />}
      <NumberInput label="쿨다운 (신호 뒤 건너뛸 봉)" value={settings.cooldownBars} limits={[0, 250]} onChange={cooldownBars => onChange({ ...settings, cooldownBars })} />
    </div>

    <div className="mt-3 grid grid-cols-3 gap-3">
      {settings.horizons.map((horizon, i) => <NumberInput key={i} label={`수익률 기간 ${i + 1} (봉)`} value={horizon}
        limits={[i === 0 ? 1 : settings.horizons[i - 1] + 1, i === 2 ? 250 : settings.horizons[i + 1] - 1]}
        onChange={value => {
          const horizons: IndexHorizons = [...settings.horizons];
          horizons[i] = value;
          onChange({ ...settings, horizons });
        }} />)}
    </div>

    <div className="my-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 bg-[#10151c] px-3 py-2.5 text-xs text-zinc-300">
      <div className="space-y-1 leading-relaxed">
        <p><strong>{indexEventLabels[event]}</strong> · {ruleSummary(rules, settings)} · 쿨다운 {settings.cooldownBars}봉</p>
        <p className="text-zinc-400">{result.start && result.end ? `${result.start} ~ ${result.end} · KRX 15:30 KST 완료 봉` : "설정한 신호를 판정할 연속 봉이 부족합니다."}</p>
      </div>
      <label className="flex shrink-0 items-center gap-2"><input type="checkbox" checked={showMarkers} onChange={e => onMarkers(e.target.checked)} className="accent-emerald-400" />일봉·주봉·월봉 차트에 신호 표시</label>
    </div>
    <div className="overflow-x-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label="기간별 수익률 비교표">
      <table className="w-full min-w-[700px] text-xs tabular-nums">
        <thead className="bg-white/[0.04] text-zinc-300"><tr>
          {['기간', '표본군', '표본 수', '평균', '중앙값', '승률', 'P25', 'P75', '최저', '최고', '상태'].map((label, i) =>
            <th scope="col" key={label} className={`whitespace-nowrap px-2 py-2.5 font-medium ${i > 1 && i < 10 ? "text-right" : "text-left"}`}>{label}</th>)}
        </tr></thead>
        {result.horizons.map(item => <tbody key={item.horizon} className="border-t border-white/10">
          <tr>
            <th scope="rowgroup" rowSpan={2} className="whitespace-nowrap px-2 py-2 text-left text-zinc-100">{item.horizon}봉</th>
            <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-medium text-emerald-300">신호 발생 봉</th>
            <Stats stats={item.signal} /><td rowSpan={2} className="px-2 py-2"><Warnings row={item} /></td>
          </tr>
          <tr className="text-zinc-400"><th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-medium">전체 봉</th><Stats stats={item.baseline} /></tr>
        </tbody>)}
      </table>
    </div>
    <div role="group" aria-label="수익률 분포 기간" className="mb-2 mt-4 flex flex-wrap gap-2">
      {result.horizons.map((item, i) => <button key={item.horizon} type="button" aria-pressed={i === selectedHorizon} onClick={() => setSelectedHorizon(i)}
        className={`rounded-md border px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-emerald-400 ${i === selectedHorizon ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-white/10 text-zinc-300 hover:bg-white/5"}`}>{item.horizon}봉 분포</button>)}
    </div>
    <Distribution row={row} />
    <SignalComparison context={`${name} ${timeframeLabels[timeframe]}`} results={results} rules={rules} settings={settings} />
    <p className="mt-3 text-xs leading-relaxed text-zinc-400">구간에 처음 진입한 봉만 집계합니다. 전체 봉은 같은 검증 기간에 수익률이 확인된 모든 시작 봉입니다. 승률은 수익률이 0%를 초과한 비율입니다. 신호 표본이 30개 미만이거나 신호 간 수익률 구간이 겹치면 표에 표시합니다.</p>
    <p className="mt-2 text-xs text-zinc-400">과거 통계이며 미래 수익을 보장하지 않음. 지수 단위 분석이며 거래비용 미반영.</p>
  </section>;
}
