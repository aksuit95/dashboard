import history from '@/data/valuation/stock-history.json';
import kosdaqHistory from '@/data/valuation/kosdaq150-stock-history.json';
import publication from '@/data/sectors/board.json';
import { resolveHistoryDates, type SessionPublication } from '@/lib/valuation/stock-history-dates';
import type { StockHistory } from '@/lib/valuation/stock-history';

export function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code') ?? '';
  if (!/^[0-9A-Z]{6}$/.test(code)) return Response.json({ error: '종목 코드를 확인해 주세요.' }, { status: 400 });
  const universe = new URL(request.url).searchParams.get('universe') ?? 'kospi200';
  if (universe !== 'kospi200' && universe !== 'kosdaq150') return Response.json({error: '지수 오류'}, {status: 400});
  const records = ((universe === 'kosdaq150' ? kosdaqHistory : history) as StockHistory).records;
  const resolved = resolveHistoryDates({schemaVersion: 1, records: {[code]: records[code] ?? []}}, publication as SessionPublication);
  return Response.json({ code, points: resolved.records[code] }, { headers: { 'Cache-Control': 'no-store' } });
}
