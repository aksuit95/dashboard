"use client";

import { useEffect, useMemo, useState } from "react";
import { DataFreshness, krxCloseDetail, latestDataTime } from "@/components/DataFreshness";
import { IndexBacktestPanel } from "@/components/IndexBacktestPanel";
import { IndexTechnicalCharts } from "@/components/IndexTechnicalChart";
import { describeIndexRules, IndexTechnicalSettings } from "@/components/IndexTechnicalSettings";
import { calculateIndexTechnical, indexChange, indexReturnPeriods, summarizeIndexTrend, type IndexTechnicalAnalysis } from "@/lib/market/index-technical";
import { indexPercentileSampleMin, restoreIndexSettings, type IndexRules } from "@/lib/market/index-rules";
import { calculateIndexBacktests, indexBacktestDefaults } from "@/lib/market/index-backtest";
import { indexTimeframes, resampleIndexSessions, timeframeLabels, type IndexTimeframe } from "@/lib/market/index-timeframe";
import type { IndexTechnicalMarket } from "@/lib/sources/index-technical";

const number = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("ko-KR");
const seoul = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium", hourCycle: "h23" });
const format = (value: number | null | undefined) => value == null ? "—" : number.format(value);
const percent = (value: number | null | undefined) => value == null ? "—" : `${number.format(value)}%`;
const signed = (value: number | null | undefined) => value != null && value > 0 ? `+${percent(value)}` : percent(value);
const panel = "min-w-0 rounded-xl border border-white/10 bg-[#151a22] p-4";
const storageKey = "dashboard-index-technical-rules-v1";
const tones = {
  up: "text-rose-300", down: "text-sky-300", neutral: "text-zinc-400", focus: "text-amber-300", flat: "text-zinc-200",
};
type Tone = keyof typeof tones;
const direction = (n: number | null | undefined): Tone => n == null || n === 0 ? "neutral" : n > 0 ? "up" : "down";

function Signal({ label, value, status, tone = "neutral" }: { label: string; value: string; status?: string; tone?: Tone }) {
  return <tr className="border-t border-white/[0.08]">
    <th scope="row" className="py-1.5 pr-2 text-left font-normal text-zinc-300">{label}</th>
    <td className="py-1.5 text-right font-medium tabular-nums text-zinc-100">{value}</td>
    <td className={`py-1.5 pl-2 text-right text-xs ${tones[tone]}`}>{status}</td>
  </tr>;
}

function SignalTable({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={panel} aria-label={title}>
    <h3 className="mb-2 text-sm font-semibold text-zinc-100">{title}</h3>
    <table className="w-full text-xs sm:text-sm">
      <thead className="sr-only"><tr><th>지표</th><th>현재값</th><th>상태</th></tr></thead>
      <tbody>{children}</tbody>
    </table>
  </section>;
}

function extremes(value: number | null, high: number, low: number): { status: string; tone: Tone } {
  return value === null ? { status: "미확인", tone: "neutral" } : value >= high ? { status: "과열", tone: "up" } :
    value <= low ? { status: "침체", tone: "down" } : { status: "중립", tone: "neutral" };
}

function Signals({ analysis, breadth, timeframe, rules }: { analysis: IndexTechnicalAnalysis; breadth: IndexTechnicalMarket["breadth"]; timeframe: IndexTimeframe; rules: IndexRules }) {
  const { latest, disparities, bandwidthThreshold } = analysis;
  const stocks = breadth.stocks;
  const above = stocks && stocks.eligible > 0 ? stocks.above / stocks.eligible * 100 : null;
  const score = summarizeIndexTrend(latest, timeframe === "day" ? above : null, timeframe);
  const unit = timeframe === "day" ? "일" : "봉";
  const trend = score.alignment === 1 ? "정배열" : score.alignment === -1 ? "역배열" : score.alignment === 0 ? "혼조" : "미확인";
  const macd = latest.macd?.histogram ?? null;
  const width = latest.bands?.width ?? null;
  const squeeze = width !== null && bandwidthThreshold !== null && width <= bandwidthThreshold;
  const scoreTone = score.status === "강세" ? "up" : score.status === "약세" ? "down" : "flat";
  const side = (value: number | null) => value === null ? "미확인" : value > 0 ? "강세" : value < 0 ? "약세" : "중립";

  return <section aria-labelledby="index-signals" className="space-y-3">
    <div className="rounded-xl border border-white/10 bg-[#18212c] px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 id="index-signals" className="text-sm font-medium text-zinc-300">종합 신호</h2>
        <strong className={`text-xl ${tones[scoreTone]}`}>{score.status}</strong>
        <span className="text-xs tabular-nums text-zinc-400">{score.score > 0 ? "+" : ""}{score.score}점 · {score.max}/4개 지표 반영{analysis.chartLatest.incomplete && ` · ${latest.date} 완료 봉 기준`}</span>
      </div>
      <details className="mt-2 text-xs text-zinc-400">
        <summary className="w-fit cursor-pointer">점수 계산 보기</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
          {score.factors.map(item => <li key={item.label} className="flex items-center justify-between gap-2 rounded bg-black/15 px-2 py-1">
            {item.label}<span className={tones[direction(item.value)]}>{item.value === null ? "—" : item.value > 0 ? "+1" : item.value}</span>
          </li>)}
        </ul>
        <p className="mt-2 leading-relaxed">각 항목은 +1·0·−1점입니다. 20일선 위 종목 비율은 55% 이상에 +1점, 45% 이하에 −1점을 줍니다. 확인된 항목이 3개 이상일 때 평균 점수가 +0.5 이상이면 강세, −0.5 이하면 약세입니다.</p>
      </details>
    </div>
    <div className="grid gap-3 lg:grid-cols-[1fr_1.12fr_1.2fr]">
      <SignalTable title="이격도 · 지수별 백분위">
        {disparities.map(item => <Signal key={item.period} label={`${item.period}${unit}`} value={format(item.value)}
          status={item.rank === null ? item.status : `${item.status} · P${format(item.rank)}`}
          tone={item.status === "과열" ? "up" : item.status === "침체" ? "down" : "neutral"} />)}
        <tr><td colSpan={3} className="border-t border-white/[0.08] pt-2 text-xs leading-relaxed text-zinc-400">{describeIndexRules(rules, timeframe).disparity}</td></tr>
      </SignalTable>
      <SignalTable title="추세 · 모멘텀">
        <Signal label={score.periodLabel} value={trend} tone={direction(score.alignment)} />
        <Signal label="ADX(14)" value={format(latest.adx)} status={latest.adx === null ? "미확인" : latest.adx >= 25 ? "추세 강함" : "추세 약함"} />
        <Signal label="RSI(14)" value={format(latest.rsi)} {...extremes(latest.rsi, 70, 30)} />
        <Signal label="MACD 히스토그램" value={format(macd)} status={side(macd)} tone={direction(macd)} />
        <Signal label="스토캐스틱 %K" value={format(latest.stochastic.k)} {...extremes(latest.stochastic.k, 80, 20)} />
      </SignalTable>
      <SignalTable title="변동성 · 시장 폭">
        <Signal label="ATR(14)" value={format(latest.atr)} status={latest.atr !== null && latest.close ? `${percent(latest.atr / latest.close * 100)} · 종가 대비` : "미확인"} />
        <Signal label="볼린저 밴드폭" value={percent(width)} status={width === null || bandwidthThreshold === null ? "미확인" : squeeze ? "스퀴즈" : "일반"} tone={squeeze ? "focus" : "neutral"} />
        <Signal label={timeframe === "day" ? "ADR(20)" : "ADR(20일)"} value={format(breadth.adr)} status={breadth.adr === null ? "미확인" : breadth.adr > 100 ? "상승 우세" : breadth.adr < 100 ? "하락 우세" : "균형"} tone={direction(breadth.adr === null ? null : breadth.adr - 100)} />
        <Signal label="20일선 위 종목" value={percent(above)} status={above !== null && stocks ? `${integer.format(stocks.above)}/${integer.format(stocks.eligible)}종목` : "미확인"} />
        <Signal label="52주 신고가 / 신저가" value={stocks?.eligible52w ? `${stocks.high} / ${stocks.low}` : "—"} status={stocks?.eligible52w ? `${integer.format(stocks.eligible52w)}종목 기준` : "미확인"} />
      </SignalTable>
    </div>
  </section>;
}

function Levels({ analysis, rules, timeframe }: { analysis: IndexTechnicalAnalysis; rules: IndexRules; timeframe: IndexTimeframe }) {
  const { levels, chartLatest } = analysis;
  return <div className="grid gap-3 lg:grid-cols-3">
    <section className={panel} aria-label="스윙 지지·저항">
      <h2 className="text-sm font-semibold">스윙 지지·저항</h2>
      <dl className="mt-2 divide-y divide-white/[0.08] text-sm tabular-nums">
        {levels.swings.map(level => <div key={level.price} className="flex items-center justify-between gap-2 py-1.5">
          <dt className={level.side === "support" ? tones.down : tones.up}>{level.side === "support" ? "지지" : "저항"}<span className="ml-2 text-xs text-zinc-400">{level.touches}회 · {level.lastTouch}</span></dt>
          <dd className="text-right text-zinc-100">{format(level.price)} <span className="text-xs text-zinc-400">{signed(indexChange(level.price, chartLatest.close))}</span></dd>
        </div>)}
      </dl>
      {!levels.swings.length && <p className="mt-2 text-xs text-zinc-400">확정된 스윙이 없습니다.</p>}
      {levels.candidates.length > 0 && <p className="mt-2 text-xs leading-relaxed text-amber-300">미확정 후보 {levels.candidates.map(item => `${item.kind === "high" ? "고점" : "저점"} ${format(item.price)} (${item.date})`).join(" · ")}</p>}
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{describeIndexRules(rules, timeframe).swing}</p>
    </section>
    <section className={panel} aria-label="피보나치 되돌림">
      <h2 className="text-sm font-semibold">피보나치 되돌림</h2>
      {levels.fibonacci ? <>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">{levels.fibonacci.first.date} → {levels.fibonacci.last.date}<br />{format(levels.fibonacci.first.price)} → {format(levels.fibonacci.last.price)}</p>
        <dl className="mt-2 divide-y divide-white/[0.08] text-sm tabular-nums">
          {levels.fibonacci.levels.map(level => <div key={level.ratio} className="flex items-center justify-between gap-2 py-1.5"><dt className="text-zinc-400">{level.ratio}%</dt><dd>{format(level.price)}</dd></div>)}
        </dl>
      </> : <p className="mt-2 text-xs text-zinc-400">기준이 되는 확정 파동이 없습니다.</p>}
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">최근 60봉의 확정 스윙 중 변동 폭이 가장 큰 3% 이상 파동을 사용합니다.</p>
    </section>
    <section className={panel} aria-label="거래량 매물대">
      <h2 className="text-sm font-semibold">매물대 <span className="font-normal text-zinc-400">· 60거래일 추정</span></h2>
      {levels.profile ? <>
        <p className="mt-2 text-xs text-teal-300">최다 거래량 구간 {format(levels.profile.highest.low)}–{format(levels.profile.highest.high)}</p>
        <div className="mt-2 space-y-1">
          {levels.profile.bins.map(bin => {
            const share = bin.volume / levels.profile!.total * 100;
            return <div key={bin.low} className="grid grid-cols-[1fr_0.55fr_auto] items-center gap-1.5 text-[11px] tabular-nums" title={`${integer.format(bin.volume)}주`}>
              <span className="text-zinc-400">{format(bin.low)}–{format(bin.high)}</span>
              <span className="h-1 rounded bg-white/5" aria-hidden="true"><span className="block h-full rounded bg-teal-400/70" style={{ width: `${bin.volume / levels.profile!.highest.volume * 100}%` }} /></span>
              <span className="text-right text-zinc-300">{share.toFixed(1)}%</span>
            </div>;
          })}
        </div>
      </> : <p className="mt-2 text-xs text-zinc-400">확인된 KRX 거래량 이력이 부족합니다.</p>}
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">각 거래일의 KRX 거래량을 그날의 지수 종가 구간에 배정합니다.</p>
    </section>
  </div>;
}

export function IndexTechnicalBoard({ indices, asOf, specialSession }: {
  indices: IndexTechnicalMarket[]; asOf: string | null; specialSession: boolean;
}) {
  const [selected, setSelected] = useState(indices[0].id);
  const [settings, setSettings] = useState(() => restoreIndexSettings(null));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [backtestSettings, setBacktestSettings] = useState(indexBacktestDefaults);
  const [showMarkers, setShowMarkers] = useState(false);
  useEffect(() => {
    try { setSettings(restoreIndexSettings(JSON.parse(localStorage.getItem(storageKey) ?? "null"))); }
    catch { /* Defaults remain usable when storage is unavailable. */ }
    setSettingsLoaded(true);
  }, []);
  useEffect(() => {
    if (!settingsLoaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); }
    catch { /* The settings still apply to this session. */ }
  }, [settings, settingsLoaded]);
  const market = indices.find(item => item.id === selected) ?? indices[0];
  const { timeframe } = settings;
  const rules = settings.rules[timeframe];
  const analysis = useMemo(() => calculateIndexTechnical(market.sessions, timeframe, rules), [market.sessions, timeframe, rules]);
  const backtestOptions = backtestSettings[timeframe];
  const { maSlot, rsiLower, rsiUpper, proximityPct, cooldownBars, horizons } = backtestOptions;
  const backtests = useMemo(() => analysis ? calculateIndexBacktests(analysis.completed, rules, {
    maSlot, rsiLower, rsiUpper, proximityPct, cooldownBars, horizons,
  }) : null, [analysis, rules, maSlot, rsiLower, rsiUpper, proximityPct, cooldownBars, horizons]);
  const backtest = backtests?.[backtestOptions.event];
  const completed = useMemo(() => resampleIndexSessions(market.sessions, timeframe).filter(point => point.regular1530 && !point.incomplete && point.close !== null), [market.sessions, timeframe]);
  const suggestedIndex = Math.min(completed.length - 2, Math.max(Math.floor(completed.length * 0.7), rules.maPeriods[2] + indexPercentileSampleMin(timeframe, rules.pctlLookback) - 2));
  const bounds = completed.length ? { first: completed[0].date, latest: completed.at(-1)!.date } : null;
  const date = market.daily?.date;
  const updatedAt = latestDataTime([market.fetchedAt, market.candlesAt]);
  const notice = asOf === null ? "최근 완료된 KRX 거래일을 확인할 수 없습니다." : specialSession ? `${asOf} 특별 운영일의 KRX 15:30 종가는 결측입니다.` :
    date !== asOf ? `${asOf} ${market.name} KRX 15:30 종가가 아직 확인되지 않았습니다.` : null;

  return <div className="space-y-4">
    <DataFreshness basis={date} updatedAt={updatedAt} basisDetail={`${market.name} · ${krxCloseDetail(date)}`}
      updateDetail="종가·일봉 중 최근 수집 시각" />
    <div role="group" aria-label="분석 지수 선택" className="grid grid-cols-2 gap-3">
      {indices.map(item => {
        const daily = item.daily?.change;
        return <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}
          className={`min-w-0 rounded-xl border px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-emerald-400 sm:px-5 ${selected === item.id ? "border-emerald-400/45 bg-emerald-400/[0.07]" : "border-white/10 bg-[#151a22] hover:border-white/25"}`}>
          <span className="block text-sm font-semibold text-zinc-200">{item.name}</span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
            <span className="text-lg font-semibold text-white sm:text-2xl">{format(item.daily?.close)}</span>
            <span className={`text-xs font-medium ${tones[direction(daily)]}`}>{signed(daily)}</span>
          </span>
          <span className="mt-1 block text-xs text-zinc-400">{item.daily?.date ?? "종가 미확인"}</span>
        </button>;
      })}
    </div>
    {market.fetchedAt && market.candlesAt && market.fetchedAt !== market.candlesAt && <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-zinc-400">
      <span>종가 수집 <time dateTime={market.fetchedAt}>{seoul.format(new Date(market.fetchedAt))} KST</time></span>
      <span>일봉 수집 <time dateTime={market.candlesAt}>{seoul.format(new Date(market.candlesAt))} KST</time></span>
    </div>}
    {notice && <p role="status" className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{notice}{date && ` ${date} 기준 저장본을 표시합니다.`}</p>}
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="봉 주기">
      {indexTimeframes.map(item => <button key={item} type="button" aria-pressed={item === timeframe}
        className={`rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-emerald-400 ${item === timeframe ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-[#151a22] text-zinc-300 hover:bg-white/5"}`}
        onClick={() => setSettings(current => ({ ...current, timeframe: item }))}>{timeframeLabels[item]}</button>)}
      {analysis?.chartLatest.incomplete && <span className="rounded-md bg-amber-400/10 px-2 py-1 text-xs text-amber-300">마지막 {timeframeLabels[timeframe]} 미완성</span>}
      {backtest && <a href="#index-backtest" className="ml-auto rounded-md px-2 py-1.5 text-xs text-emerald-300 hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-emerald-400">과거 신호 검증 ↓</a>}
    </div>
    <IndexTechnicalSettings timeframe={timeframe} rules={rules} suggestCalibration={suggestedIndex >= 0 ? completed[suggestedIndex].date : null} bounds={bounds}
      onChange={next => setSettings(current => ({ ...current, rules: { ...current.rules, [timeframe]: next } }))} />
    {analysis ? <>
      <Signals analysis={analysis} breadth={market.breadth} timeframe={timeframe} rules={rules} />
      <IndexTechnicalCharts key={timeframe} name={market.name} analysis={analysis} timeframe={timeframe} rules={rules} eventMarkers={showMarkers ? backtest?.events ?? null : null} />
      {backtests && <IndexBacktestPanel name={market.name} timeframe={timeframe} rules={rules} settings={backtestOptions} results={backtests}
        showMarkers={showMarkers} onMarkers={setShowMarkers} onChange={next => setBacktestSettings(current => ({ ...current, [timeframe]: next }))} />}
      <Levels analysis={analysis} rules={rules} timeframe={timeframe} />
      <details className={`${panel} text-xs leading-relaxed text-zinc-400`}>
        <summary className="w-fit cursor-pointer font-medium text-zinc-200">이동평균 값 · 기간 등락률 · 계산 기준</summary>
        <p className="mt-2 flex flex-wrap gap-x-4 tabular-nums">{Object.keys(analysis.latest.averages).map(Number).map(period => <span key={period}>{period}{timeframe === "day" ? "일" : "봉"}선 <strong className="text-zinc-200">{format(analysis.latest.averages[period])}</strong></span>)}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 tabular-nums">{indexReturnPeriods.slice(1).map((period, i) => <span key={period}>{period}{timeframe === "day" ? "일" : "봉"} 등락률 <strong className={tones[direction(analysis.returns[i + 1])]}>{signed(analysis.returns[i + 1])}</strong></span>)}</p>
        <p className="mt-2">이격도는 종가 ÷ 단순이동평균 × 100입니다. 주·월봉의 미완성 봉은 차트에만 표시합니다. 밴드폭 스퀴즈는 해당 주기의 과거 밴드폭 분포 하위 10%를 기준으로 봅니다.</p>
        <p className="mt-2">ADR은 비교일과 전 거래일 모두 KRX 15:30 종가가 있는 일별 등락 집계 20개를 사용합니다. 20일선 위 종목 비율과 52주 신고가·신저가는 검증된 이력이 있는 보통주를 기준으로 계산합니다. 같은 기준일 자료가 없으면 —로 표시합니다.</p>
      </details>
    </> : <p className={`${panel} py-10 text-center text-sm text-zinc-400`}>검증된 KRX 종가 이력이 게시되면 기술적 지표를 표시합니다.</p>}
  </div>;
}
