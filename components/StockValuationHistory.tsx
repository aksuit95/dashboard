"use client";

import { useEffect, useState } from 'react';
import { stockMetrics, type StockMetric } from '@/lib/valuation/stocks';
import type { StockHistoryPoint } from '@/lib/valuation/stock-history';
import type { MinerviniBar } from '@/lib/market/minervini';
import { matchForwardHistory } from '@/lib/valuation/stock-forward';

export function StockValuationHistory({ code }: { code: string }) {
  const [metric, setMetric] = useState<StockMetric>('per');
  const [points, setPoints] = useState<StockHistoryPoint[]>([]);
  const [error, setError] = useState(false);
  const [priceBook, setPriceBook] = useState<{code: string; bars: MinerviniBar[]; asOf: string} | null>(null);
  const [priceError, setPriceError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPoints([]); setError(false); setPriceBook(null); setPriceError(false);
    fetch(`/api/valuation/stocks/history?code=${encodeURIComponent(code)}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setPoints(data.points))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    fetch(`/api/valuation/stocks/candles?code=${encodeURIComponent(code)}&basis=krx-1530`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json() as {code?: string; bars?: MinerviniBar[]; priceBasis?: string; asOf?: string};
        if (data.code !== code || data.priceBasis !== 'KRX_REGULAR_CLOSE' || !Array.isArray(data.bars) || !data.asOf) throw new Error();
        if (!controller.signal.aborted) setPriceBook({code, bars: data.bars, asOf: data.asOf});
      }).catch(() => { if (!controller.signal.aborted) setPriceError(true); });
    return () => controller.abort();
  }, [code]);
  const definition = stockMetrics.find(item => item.id === metric)!;
  const isRatio = metric === 'per' || metric === 'pbr';
  const unavailable = metric === 'evEbitda';
  const values = isRatio ? matchForwardHistory(points, priceBook?.code === code ? priceBook.bars : [], metric).map(p => ({date: p.date, value: p.ratio})) : unavailable ? [] : points.flatMap(p => typeof p.values[metric] === 'number' ? [{ date: p.date, value: p.values[metric]! }] : []);
  const min = Math.min(...values.map(p => p.value)), max = Math.max(...values.map(p => p.value));
  const span = max - min || Math.abs(max) * .1 || 1;
  const first = values.length ? Date.parse(values[0].date) : 0;
  const elapsed = values.length > 1 ? Date.parse(values.at(-1)!.date) - first : 0;
  const coords = values.map(p => ({ ...p, x: elapsed ? 45 + (Date.parse(p.date) - first) * 510 / elapsed : 300, y: 175 - (p.value - min) / span * 130 }));
  return <section className="rounded-xl border border-white/10 bg-[#151a22] p-4">
    <h2 className="font-semibold">선행 밸류에이션 추이</h2>
    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{isRatio ? '확인된 동일 기준일 선행 추정치와 KRX 15:30 정규장 종가로 계산합니다.' : 'QuantiWise 조회일별 저장 기록 · 원본 기준일 CPD-1TD의 실제 날짜는 확인되지 않았습니다.'}</p>
    <div className="mt-4 flex flex-wrap gap-2">{stockMetrics.map(item => <button key={item.id} type="button" aria-pressed={metric === item.id} onClick={() => setMetric(item.id)} className={`rounded-md border px-3 py-1.5 text-xs ${metric === item.id ? 'border-sky-400 text-sky-300' : 'border-white/10 text-zinc-400'}`}>{item.name}</button>)}</div>
    {error ? <p role="status" className="py-12 text-center text-sm text-amber-200">이력을 불러오지 못했습니다.</p> : isRatio && priceError ? <p role="status" className="py-12 text-center text-sm text-amber-200">KRX 종가를 불러오지 못했습니다.</p> : unavailable ? <p className="py-12 text-center text-sm leading-relaxed text-zinc-400">{definition.name} 추이 결측<br /><span className="text-xs text-zinc-500">원본의 가격 거래소와 정규장 종가 기준을 확인할 수 없습니다.</span></p> : !values.length ? <p className="py-12 text-center text-sm text-zinc-500">{isRatio ? priceBook ? '같은 기준일의 KRX 종가와 선행 추정치가 없습니다.' : 'KRX 종가를 불러오고 있습니다…' : '저장된 조회 기록이 없습니다.'}</p> : <>
      <svg viewBox="0 0 600 220" role="img" aria-label={`${definition.name} ${isRatio ? '기준일별' : '조회일별'} 기록`} className="mt-4 w-full max-w-4xl">
        <line x1="45" y1="175" x2="555" y2="175" stroke="#52525b" />
        <polyline fill="none" stroke={definition.color} strokeWidth="2.5" points={coords.map(p => `${p.x},${p.y}`).join(' ')} />
        {coords.map(p => <g key={p.date}><circle cx={p.x} cy={p.y} r="4" fill={definition.color}><title>{`${p.date} ${isRatio ? '기준' : '조회'} · ${p.value.toLocaleString('ko-KR', {maximumFractionDigits: 2})} ${definition.unit}`}</title></circle><text x={p.x} y="198" textAnchor="middle" fontSize="10" fill="#a1a1aa">{p.date.slice(5)}</text></g>)}
        <text x="45" y="22" fontSize="11" fill="#a1a1aa">{max.toLocaleString('ko-KR', {maximumFractionDigits: 2})} {definition.unit}</text><text x="45" y="165" fontSize="11" fill="#a1a1aa">{min.toLocaleString('ko-KR', {maximumFractionDigits: 2})} {definition.unit}</text>
      </svg><p className="mt-1 text-xs text-zinc-500">기록 {values.length}개 · 가로축은 {isRatio ? '일치한 기준일' : '원본 조회일'}이며 선은 저장된 관측값을 연결합니다.{isRatio && priceBook ? ` KRX 가격 기준일 ${priceBook.asOf}.` : ''}</p>
    </>}
  </section>;
}
