"use client";

import { useState } from "react";
import { defaultIndexRules, indexPercentileSampleMin, indexRuleLimits, minPercentileSamples, validIndexRuleNumber, type IndexRules } from "@/lib/market/index-rules";
import { timeframeLabels, type IndexTimeframe } from "@/lib/market/index-timeframe";

const input = "mt-1 w-full rounded-md border border-white/15 bg-[#10151c] px-2.5 py-1.5 text-sm tabular-nums text-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-400";

export function NumberInput({ label, value, limits, onChange, step = 1 }: {
  label: string; value: number; limits: readonly [number, number]; onChange: (value: number) => void; step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="min-w-0 text-xs text-zinc-300">{label}
    <input type="number" min={limits[0]} max={limits[1]} step={step} value={draft ?? value} aria-invalid={draft !== null}
      className={`${input} aria-invalid:border-amber-400/80`}
      onChange={event => {
        const element = event.currentTarget;
        if (!validIndexRuleNumber(element.valueAsNumber, limits, step === 1)) {
          setDraft(element.value);
          return;
        }
        setDraft(null);
        onChange(element.valueAsNumber);
      }} onBlur={() => setDraft(null)} />
  </label>;
}

export function describeIndexRules(rules: IndexRules, timeframe: IndexTimeframe) {
  const window = rules.pctlLookback === "all" ? "전체 이력" : `최근 ${rules.pctlLookback}봉`;
  const mode = rules.expanding ? "각 봉 직전까지 다시 계산합니다." : rules.calibrationEnd ? `${rules.calibrationEnd}까지의 분포로 고정합니다.` : "고정 기준일을 선택하면 계산합니다.";
  return {
    swing: `최근 ${rules.lookbackBars}봉에서 좌우 ${rules.swingN}봉보다 높은 고가와 낮은 저가를 스윙으로 봅니다. 가격차 ${rules.clusterTolPct}% 이내를 묶어 평균 가격을 표시하며, 최소 ${rules.minTouches}회 터치한 레벨 중 위·아래 각 ${rules.maxLevels}개까지 표시합니다.`,
    disparity: `${timeframeLabels[timeframe]} ${rules.maPeriods.join("·")}봉 이격도의 P${rules.pctlLower}·P${rules.pctlUpper} 임계치에는 ${window} 중 유효 표본이 ${indexPercentileSampleMin(timeframe, rules.pctlLookback)}개 이상 필요합니다. ${mode}`,
  };
}

export function IndexTechnicalSettings({ timeframe, rules, suggestCalibration, bounds, onChange }: {
  timeframe: IndexTimeframe; rules: IndexRules; suggestCalibration: string | null; bounds: { first: string; latest: string } | null;
  onChange: (rules: IndexRules) => void;
}) {
  const description = describeIndexRules(rules, timeframe);
  const [reset, setReset] = useState(0);
  const minSamples = minPercentileSamples[timeframe];
  const minimumLookback = rules.swingN * 2 + 1;
  const maLabels = ["단기 이동평균 (봉)", "중기 이동평균 (봉)", "장기 이동평균 (봉)"];

  return <details className="rounded-xl border border-white/10 bg-[#151a22] px-4 py-3.5">
    <summary className="w-fit cursor-pointer text-sm font-semibold text-zinc-100">규칙 및 설정</summary>
    <div key={`${timeframe}-${reset}`} className="mt-4 grid gap-5 lg:grid-cols-2">
      <fieldset className="min-w-0">
        <legend className="mb-2.5 text-sm font-semibold text-zinc-100">스윙 지지·저항</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <NumberInput label="좌우 비교 봉" value={rules.swingN} limits={indexRuleLimits.swingN} onChange={swingN => onChange({ ...rules, swingN, lookbackBars: Math.max(rules.lookbackBars, swingN * 2 + 1) })} />
          <NumberInput label="가격 묶음 허용차 (%)" value={rules.clusterTolPct} limits={indexRuleLimits.clusterTolPct} step={0.05} onChange={clusterTolPct => onChange({ ...rules, clusterTolPct })} />
          <NumberInput label="최소 터치 횟수" value={rules.minTouches} limits={indexRuleLimits.minTouches} onChange={minTouches => onChange({ ...rules, minTouches })} />
          <NumberInput label="탐지 범위 (봉)" value={rules.lookbackBars} limits={[minimumLookback, indexRuleLimits.lookbackBars[1]]} onChange={lookbackBars => onChange({ ...rules, lookbackBars })} />
          <NumberInput label="위·아래 최대 레벨 수" value={rules.maxLevels} limits={indexRuleLimits.maxLevels} onChange={maxLevels => onChange({ ...rules, maxLevels })} />
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2.5 text-sm font-semibold text-zinc-100">이격도 임계치</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {rules.maPeriods.map((period, i) => <NumberInput key={maLabels[i]} label={maLabels[i]} value={period}
            limits={[i === 0 ? indexRuleLimits.ma[0] : rules.maPeriods[i - 1] + 1, i === 2 ? indexRuleLimits.ma[1] : rules.maPeriods[i + 1] - 1]}
            onChange={value => {
              const maPeriods: IndexRules["maPeriods"] = [...rules.maPeriods];
              maPeriods[i] = value;
              onChange({ ...rules, maPeriods });
            }} />)}
          <NumberInput label="하위 백분위" value={rules.pctlLower} limits={indexRuleLimits.pctlLower} step={0.5}
            onChange={pctlLower => { if (pctlLower < rules.pctlUpper) onChange({ ...rules, pctlLower }); }} />
          <NumberInput label="상위 백분위" value={rules.pctlUpper} limits={indexRuleLimits.pctlUpper} step={0.5}
            onChange={pctlUpper => { if (pctlUpper > rules.pctlLower) onChange({ ...rules, pctlUpper }); }} />
          <label className="text-xs text-zinc-300">분포 조회 범위
            <select className={input} value={rules.pctlLookback === "all" ? "all" : "recent"} onChange={event => {
              const preset = defaultIndexRules[timeframe].pctlLookback;
              onChange({ ...rules, pctlLookback: event.target.value === "all" ? "all" : preset === "all" ? minSamples * 2 : preset });
            }}><option value="all">전체 이력</option><option value="recent">최근 N봉</option></select>
          </label>
          {rules.pctlLookback !== "all" && <NumberInput label="분포 조회 N봉" value={rules.pctlLookback} limits={indexRuleLimits.pctlLookback}
            onChange={pctlLookback => onChange({ ...rules, pctlLookback })} />}
          <label className="self-end text-xs text-zinc-300">임계치 계산 방식
            <select className={input} value={rules.expanding ? "expanding" : "fixed"} onChange={event => {
              const expanding = event.target.value === "expanding";
              onChange({ ...rules, expanding, calibrationEnd: rules.calibrationEnd ?? (expanding ? null : suggestCalibration) });
            }}><option value="expanding">시점별 갱신</option><option value="fixed">과거 분포로 고정</option></select>
          </label>
          {!rules.expanding && <label className="text-xs text-zinc-300">분포 고정 기준일
            <input type="date" className={input} min={bounds?.first} max={bounds?.latest} value={rules.calibrationEnd ?? ""}
              onChange={event => onChange({ ...rules, calibrationEnd: event.target.value || null })} />
          </label>}
        </div>
      </fieldset>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-zinc-400">
      <span>이 브라우저에 일·주·월봉 설정을 각각 저장합니다.</span>
      <button type="button" className="rounded-md border border-white/15 px-3 py-1.5 text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400"
        onClick={() => { onChange(defaultIndexRules[timeframe]); setReset(value => value + 1); }}>기본값으로 되돌리기</button>
    </div>
    <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-zinc-400">
      <p>{description.swing}</p>
      <p>{description.disparity}</p>
    </div>
  </details>;
}
