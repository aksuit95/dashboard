import history from '@/data/valuation/annual-estimates.json';
import type { AnnualHistory } from '@/lib/valuation/annual-estimates';
export function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code') ?? '';
  if (!/^[0-9A-Z]{6}$/.test(code)) return Response.json({error:'종목 코드 오류'}, {status:400});
  return Response.json({code, points:(history as AnnualHistory).records[code] ?? []}, {headers:{'Cache-Control':'no-store'}});
}
