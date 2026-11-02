import { perShareKrw, premiumPercent } from "@/lib/market/convert";

export type CloseBar = { date: string; close: number };

export type AdrPremiumPoint = {
  date: string;
  premium: number;
  commonKrw: number;
  adrPerShareKrw: number;
  adrDate?: string;
  fxDate?: string;
};

/** 같은 날짜에 본주, ADR, 원달러가 모두 있을 때만 괴리율을 만든다. */
export function adrPremiumSeries(input: {
  common: CloseBar[];
  adr: CloseBar[];
  usdkrw: CloseBar[];
  sharesPerReceipt: number;
  atKoreanClose?: boolean;
}): AdrPremiumPoint[] {
  if (input.atKoreanClose) {
    const adr = [...closeMap(input.adr)].filter(([, value]) => value > 0).sort(([a], [b]) => a.localeCompare(b));
    const fx = [...closeMap(input.usdkrw)].filter(([, value]) => value > 0).sort(([a], [b]) => a.localeCompare(b));
    const points: AdrPremiumPoint[] = [];
    for (const [date, commonKrw] of [...closeMap(input.common)].sort(([a], [b]) => a.localeCompare(b))) {
      const priorAdr = adr.findLast(([day]) => day < date);
      const priorFx = fx.findLast(([day]) => day < date);
      if (!priorAdr || !priorFx || commonKrw <= 0) continue;
      const adrPerShareKrw = perShareKrw(priorAdr[1], priorFx[1], input.sharesPerReceipt);
      const premium = premiumPercent(adrPerShareKrw, commonKrw);
      if (adrPerShareKrw == null || premium == null) continue;
      points.push({ date, commonKrw, adrPerShareKrw, premium, adrDate: priorAdr[0], fxDate: priorFx[0] });
    }
    return points;
  }
  const common = closeMap(input.common);
  const fx = closeMap(input.usdkrw);
  const points: AdrPremiumPoint[] = [];
  for (const bar of [...input.adr].sort((a, b) => a.date.localeCompare(b.date))) {
    const commonKrw = common.get(bar.date);
    const usdkrw = fx.get(bar.date);
    if (commonKrw == null || usdkrw == null) continue;
    const adrPerShareKrw = perShareKrw(bar.close, usdkrw, input.sharesPerReceipt);
    const premium = premiumPercent(adrPerShareKrw, commonKrw);
    if (adrPerShareKrw == null || premium == null) continue;
    points.push({ date: bar.date, premium, commonKrw, adrPerShareKrw });
  }
  return points;
}

function closeMap(bars: CloseBar[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const bar of bars) {
    if (!bar.date || !Number.isFinite(bar.close)) continue;
    map.set(bar.date, bar.close);
  }
  return map;
}
