import csv, io, json, os, re, tempfile, time, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from urllib.parse import quote

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
METRICS_VERSION = 1
HEADERS = {'User-Agent': 'Mozilla/5.0 dashboard research contact', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}

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
        rows[code] = dict(code=code, name=name, industry=ind, sector=classify(ind,broad,code),
                          membership='S&P 500', issuer=r['CIK'].strip() or code)
    for r in nd:
        code, name, ind, broad = (r[k].strip() for k in ('Ticker','Company','GICS_Sector','GICS_Sub_Industry'))
        if code not in rows: rows[code] = dict(code=code, name=name, industry=ind, sector=classify(ind,broad,code), membership='NASDAQ 100')
        else: rows[code]['membership'] = 'S&P 500 · NASDAQ 100'
    return list(rows.values())

def chart(symbol):
    ticker = quote(symbol.replace('.', '-'), safe='')
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=2y&includePrePost=false&events=splits&_={time.time_ns()}'
    return json.loads(get(url))['chart']['result'][0]

def closes_from_chart(result):
    closes = result['indicators']['quote'][0]['close']
    return {eastern(datetime.fromtimestamp(t, timezone.utc)).date().isoformat(): c for t,c in zip(result['timestamp'], closes) if c is not None and c > 0}

def latest_regular_close(result, day, close_hour):
    # Some finalized quotes appear in regular-session metadata before the daily bar.
    meta = result.get('meta', {})
    stamp = meta.get('regularMarketTime')
    price = meta.get('regularMarketPrice')
    if not isinstance(stamp, (float, int)) or not isinstance(price, (float, int)) or price <= 0:
        return None
    et = eastern(datetime.fromtimestamp(stamp, timezone.utc))
    if et.date().isoformat() == day and et.hour >= close_hour:
        return price
    return None

def shares_history(symbol, now):
    ticker = quote(symbol.replace('.', '-'), safe='')
    start = int((now - timedelta(days=550)).timestamp())
    end = int((now + timedelta(days=1)).timestamp())
    url = (f'https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{ticker}'
           f'?symbol={ticker}&period1={start}&period2={end}')
    payload = json.loads(get(url))['timeseries']
    entry = next((r for r in payload['result'] or [] if r['meta'].get('type') == ['shares_out']), {})
    # The fundamentals endpoint dates share observations at midnight UTC.
    return [(datetime.fromtimestamp(t, timezone.utc).date().isoformat(), value)
            for t, value in sorted(zip(entry.get('timestamp', []), entry.get('shares_out', [])), key=lambda row: row[0])
            if isinstance(value, (float, int)) and value > 0]

def estimate_market_cap(day, close, shares, splits):
    observation = next(((date, count) for date, count in reversed(shares) if date <= day), None)
    if close is None or observation is None:
        return None
    observed_date, count = observation
    # Chart closes are split-adjusted. Convert the observation to the same share basis.
    for split_day, ratio in splits:
        if split_day > observed_date:
            count *= ratio
    return round(close * count)

def is_completed_session(day, now_et):
    return day < now_et.date().isoformat() or (day == now_et.date().isoformat() and (now_et.hour, now_et.minute) >= (16, 0))

def expected_session(now_et, calendar_text):
    year = re.search(r'export const CALENDAR_YEAR = (\d{4})', calendar_text)
    if not year or int(year.group(1)) != now_et.year:
        raise ValueError('미국 거래일 캘린더 갱신 필요')
    section = calendar_text.split('export const US_HOLIDAYS:', 1)[1].split('};', 1)[0]
    holidays = set(re.findall(r'"(\d{4}-\d{2}-\d{2})"', section))
    day = now_et.date()
    if (now_et.hour, now_et.minute) < (16, 0): day -= timedelta(days=1)
    while day.weekday() >= 5 or day.isoformat() in holidays:
        day -= timedelta(days=1)
    # The explicit calendar covers one year only. Do not guess across its boundary.
    if day.year != int(year.group(1)): raise ValueError('이전 연도 미국 거래일 캘린더 확인 필요')
    return day.isoformat()

def main():
    now = datetime.now(timezone.utc)
    et = eastern(now)
    calendar = Path('config/market-calendar.ts').read_text(encoding='utf-8')
    expected = expected_session(et, calendar)
    early_closes = calendar.split('export const US_EARLY_CLOSE', 1)[1].split(';', 1)[0]
    close_hour = 13 if f'"{expected}"' in early_closes else 16
    benchmark = closes_from_chart(chart('SPY'))
    dates = sorted(d for d in benchmark if is_completed_session(d, et))
    if len(dates) < 280: raise ValueError('미국 정규장 기준 이력 부족')
    if dates[-1] != expected: raise ValueError(f'미국 최신 거래일 미반영: 기대 {expected}, SPY {dates[-1]}')
    if os.environ.get('SKIP_IF_CURRENT') == 'true' and os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f: previous = json.load(f)
        if (previous.get('priceBasis') == 'US_REGULAR_CLOSE' and previous.get('latestDate') == expected
                and previous.get('metricsVersion') == METRICS_VERSION):
            print(f'Already published {expected}')
            return
    members = universe()
    # Yahoo share observations can describe the whole issuer for several share classes.
    # Use the first index ticker per issuer for weighted sector returns.
    representatives = {}
    for row in members:
        representatives.setdefault(row.get('issuer', row['code']), row['code'])

    def collect(row):
        code = row['code']
        try:
            result = chart(code)
            history = closes_from_chart(result)
            if expected not in history:
                close = latest_regular_close(result, expected, close_hour)
                if close is not None:
                    history[expected] = close
            splits = [(eastern(datetime.fromtimestamp(event['date'], timezone.utc)).date().isoformat(),
                       event['numerator'] / event['denominator'])
                      for event in result.get('events', {}).get('splits', {}).values()
                      if event['numerator'] > 0 and event['denominator'] > 0]
        except Exception as e:
            print(f'{code} close: {e}', flush=True)
            return {}, {}, False
        try:
            shares = shares_history(code, now)
        except Exception as e:
            print(f'{code} shares: {e}', flush=True)
            shares = []
        caps = {day: estimate_market_cap(day, history.get(day), shares, splits) for day in dates[-30:]}
        return history, caps, representatives[row.get('issuer', code)] == code
    with ThreadPoolExecutor(max_workers=4) as pool:
        histories = list(pool.map(collect, members))
    latest = dates[-1]
    coverage = sum(latest in history for history, _, _ in histories)
    if coverage < len(members) * .90: raise ValueError(f'최신 종가 수집 부족 {coverage}/{len(members)}')
    index = closes_from_chart(chart('^GSPC'))
    if latest not in index or dates[-2] not in index:
        raise ValueError(f'S&P 500 지수 종가 미반영: {latest}')
    cap_coverage = sum(caps.get(latest) is not None for _, caps, _ in histories)
    if cap_coverage < len(members) * .90:
        raise ValueError(f'최신 시가총액 수집 부족 {cap_coverage}/{len(members)}')
    snapshots = {}
    index_daily = {}
    for ix in range(max(252,len(dates)-30), len(dates)):
        day = dates[ix]
        rows = []
        previous_day = dates[ix - 1]
        if day in index and previous_day in index:
            index_daily[day] = dict(change=(index[day] / index[previous_day] - 1) * 100, previousDate=previous_day)
        for m, (h, caps, representative) in zip(members, histories):
            price = h.get(day)
            returns = {}
            for label, offset in [('1d',1),('3d',3),('1w',5),('1m',21),('3m',63),('6m',126),('1y',252)]:
                base = h.get(dates[ix-offset])
                returns[label] = (price/base-1)*100 if price and base else None
            rows.append({**m, 'price':price, 'returns':returns, 'marketCap':caps[day], 'sectorCapEligible':representative})
        snapshots[day] = rows
    publication = dict(schemaVersion=1, metricsVersion=METRICS_VERSION, latestDate=latest,
                       fetchedAt=now.isoformat(), priceBasis='US_REGULAR_CLOSE', snapshots=snapshots, indexDaily=index_daily)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=os.path.dirname(OUT), suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f: json.dump(publication, f, ensure_ascii=False, separators=(',',':'))
        os.replace(temp, OUT)
    finally:
        if os.path.exists(temp): os.unlink(temp)
    print(f'Published {latest}: close {coverage}/{len(members)}, market cap {cap_coverage}/{len(members)}')

if __name__ == '__main__': main()
