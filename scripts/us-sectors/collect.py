import csv, io, json, os, tempfile, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

def eastern(now):
    # US daylight time: second Sunday in March to first Sunday in November.
    year = now.year
    march = datetime(year, 3, 1, tzinfo=timezone.utc)
    november = datetime(year, 11, 1, tzinfo=timezone.utc)
    start = march + timedelta(days=(6-march.weekday()) % 7 + 7, hours=7)
    end = november + timedelta(days=(6-november.weekday()) % 7, hours=6)
    return now.astimezone(timezone(timedelta(hours=-4 if start <= now < end else -5)))

SP = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'
NASDAQ = 'https://raw.githubusercontent.com/Gary-Strauss/NASDAQ100_Constituents/master/data/nasdaq100_constituents.csv'
OUT = 'data/us-sectors/board.json'
HEADERS = {'User-Agent': 'Mozilla/5.0 dashboard research contact'}

def get(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=25) as r:
                return r.read().decode('utf-8-sig')
        except Exception:
            if attempt == 2: raise
            time.sleep(1 + attempt * 2)

def classify(industry, broad, symbol):
    s = industry.lower()
    if symbol in ('ASML', 'AMAT', 'LRCX', 'KLAC', 'TER'): return '반도체 장비'
    if symbol in ('PDD', 'MELI'): return '소비·유통·여행'
    if 'semiconductor' in s and 'equipment' in s: return '반도체 장비'
    if 'semiconductor' in s: return '반도체'
    if any(x in s for x in ('software', 'computer services', 'it consulting', 'data processing', 'internet services')): return '소프트웨어·IT서비스'
    if any(x in s for x in ('computer hardware', 'technology hardware', 'electronic components', 'communications equipment', 'electronic equipment')): return 'IT 하드웨어·통신장비'
    if any(x in s for x in ('biotechnology', 'pharmaceutical', 'life sciences')): return '제약·바이오'
    if any(x in s for x in ('health care equipment', 'health care supplies', 'medical', 'health care services', 'managed health')): return '의료기기·서비스'
    if any(x in s for x in ('bank', 'insurance', 'capital markets', 'financial', 'credit', 'finance', 'transaction')): return '금융'
    if any(x in s for x in ('oil', 'gas', 'energy')): return '에너지'
    if any(x in s for x in ('electric utilities', 'power generation', 'electricity', 'multi-utilities', 'water utilities', 'power producers')): return '전력·유틸리티'
    if any(x in s for x in ('aerospace', 'defense', 'ordnance')): return '항공·방산'
    if any(x in s for x in ('automobile', 'automotive', 'motor vehicle', 'auto parts')): return '자동차·부품'
    if any(x in s for x in ('retail', 'restaurants', 'hotels', 'leisure', 'cruise', 'distribution')): return '소비·유통·여행'
    if any(x in s for x in ('interactive media', 'entertainment', 'broadcast', 'television', 'telecommunications', 'media', 'amusement')): return '미디어·통신'
    if any(x in s for x in ('chemical', 'metal', 'mining', 'materials', 'paper', 'packaging')): return '소재·화학'
    if any(x in s for x in ('reit', 'real estate')): return '부동산'
    return {'Information Technology':'소프트웨어·IT서비스', 'Technology':'소프트웨어·IT서비스', 'Health Care':'의료기기·서비스', 'Financials':'금융', 'Energy':'에너지', 'Utilities':'전력·유틸리티', 'Consumer Staples':'필수소비재', 'Consumer Discretionary':'소비·유통·여행', 'Industrials':'산업재', 'Materials':'소재·화학', 'Basic Materials':'소재·화학', 'Real Estate':'부동산', 'Communication Services':'미디어·통신', 'Telecommunications':'미디어·통신'}.get(broad, '기타·미분류')

def universe():
    sp = list(csv.DictReader(io.StringIO(get(SP))))
    nd = list(csv.DictReader(io.StringIO(get(NASDAQ))))
    if not 490 <= len(sp) <= 550 or not 90 <= len(nd) <= 120: raise ValueError('구성종목 수 검증 실패')
    rows = {}
    for r in sp:
        code, name, broad, ind = (r[k].strip() for k in ('Symbol','Security','GICS Sector','GICS Sub-Industry'))
        rows[code] = dict(code=code, name=name, industry=ind, sector=classify(ind,broad,code), membership='S&P 500')
    for r in nd:
        code, name, ind, broad = (r[k].strip() for k in ('Ticker','Company','GICS_Sector','GICS_Sub_Industry'))
        if code not in rows: rows[code] = dict(code=code, name=name, industry=ind, sector=classify(ind,broad,code), membership='NASDAQ 100')
        else: rows[code]['membership'] = 'S&P 500 · NASDAQ 100'
    return list(rows.values())

def chart(symbol):
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol.replace('.', '-') + '?interval=1d&range=2y&includePrePost=false'
    result = json.loads(get(url))['chart']['result'][0]
    closes = result['indicators']['quote'][0]['close']
    return {eastern(datetime.fromtimestamp(t, timezone.utc)).date().isoformat(): c for t,c in zip(result['timestamp'], closes) if c is not None and c > 0}

def is_completed_session(day, now_et):
    return day < now_et.date().isoformat() or (day == now_et.date().isoformat() and (now_et.hour, now_et.minute) >= (16, 0))

def main():
    now = datetime.now(timezone.utc)
    et = eastern(now)
    benchmark = chart('SPY')
    dates = sorted(d for d in benchmark if is_completed_session(d, et))
    if len(dates) < 280: raise ValueError('미국 정규장 기준 이력 부족')
    members = universe()
    def collect(row):
        try: return chart(row['code'])
        except Exception as e:
            print(row['code'], str(e), flush=True)
            return {}
    with ThreadPoolExecutor(max_workers=4) as pool: histories = list(pool.map(collect, members))
    latest = dates[-1]
    coverage = sum(latest in h for h in histories)
    if coverage < len(members) * .90: raise ValueError(f'최신 종가 수집 부족 {coverage}/{len(members)}')
    snapshots = {}
    for ix in range(max(252,len(dates)-30), len(dates)):
        day = dates[ix]
        rows = []
        for m,h in zip(members,histories):
            price = h.get(day)
            returns = {}
            for label, offset in [('1d',1),('1w',5),('1m',21),('3m',63),('6m',126),('1y',252)]:
                base = h.get(dates[ix-offset])
                returns[label] = (price/base-1)*100 if price and base else None
            rows.append({**m, 'price':price, 'returns':returns})
        snapshots[day] = rows
    publication = dict(schemaVersion=1, latestDate=latest, fetchedAt=now.isoformat(), priceBasis='US_REGULAR_CLOSE', snapshots=snapshots)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=os.path.dirname(OUT), suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f: json.dump(publication, f, ensure_ascii=False, separators=(',',':'))
        os.replace(temp, OUT)
    finally:
        if os.path.exists(temp): os.unlink(temp)
    print(f'Published {latest}: {coverage}/{len(members)}')

if __name__ == '__main__': main()
