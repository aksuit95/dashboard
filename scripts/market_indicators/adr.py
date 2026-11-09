"""Reuse the existing validated Naver KRX 20-session ADR publication."""
import json

def collect(start, end, market, root):
    data = json.loads((root / 'data/adr/board.json').read_text(encoding='utf-8'))
    if data.get('version') != 1 or data.get('source') != 'NAVER_KRX_REGULAR' or data.get('asOf') != end.isoformat(): raise ValueError(f'{market} ADR 최신 기준일 미반영')
    days = data['markets'][market]['days']
    points = [{'date': d['date'], 'value': d['value']} for d in days if d.get('value') is not None and start.isoformat() <= d['date'] <= end.isoformat()]
    if not points or points[-1]['date'] != end.isoformat(): raise ValueError(f'{market} ADR 이력 누락')
    return points, data['fetchedAt']
