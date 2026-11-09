"""Yahoo KRW=X daily FX values; exclude the incomplete London-local daily bar."""
import calendar
import datetime as dt
import json
import urllib.parse
import urllib.request

UTC = dt.timezone.utc

def london_date(timestamp):
    utc = dt.datetime.fromtimestamp(timestamp, UTC)
    def last_sunday(year, month):
        last = calendar.monthrange(year, month)[1]
        d = dt.date(year, month, last)
        return last - ((d.weekday() + 1) % 7)
    begin = dt.datetime(utc.year, 3, last_sunday(utc.year, 3), 1, tzinfo=UTC)
    end = dt.datetime(utc.year, 10, last_sunday(utc.year, 10), 1, tzinfo=UTC)
    return (utc + dt.timedelta(hours=1 if begin <= utc < end else 0)).date()

def collect(start, end, now=None, fetch=None):
    now = now or dt.datetime.now(UTC)
    period1 = int(dt.datetime.combine(start - dt.timedelta(days=2),dt.time(),UTC).timestamp())
    period2 = int(dt.datetime.combine(end + dt.timedelta(days=2),dt.time(),UTC).timestamp())
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?' + urllib.parse.urlencode({'period1':period1,'period2':period2,'interval':'1d'})
    if fetch is None:
        def fetch(u):
            req = urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(req,timeout=25) as r: return json.load(r)
    result = fetch(url)['chart']['result'][0]
    meta = result['meta']
    if meta.get('symbol') != 'KRW=X' or meta.get('currency') != 'KRW' or meta.get('exchangeTimezoneName') != 'Europe/London': raise ValueError('Yahoo 환율 시장·통화·시간대 확인 실패')
    timestamps, closes = result['timestamp'], result['indicators']['quote'][0]['close']
    if len(timestamps) != len(closes): raise ValueError('환율 일봉 길이 불일치')
    current_london = london_date(now.timestamp())
    values = {}
    for timestamp, close in zip(timestamps, closes):
        day = london_date(timestamp)
        if not start <= day <= end or day >= current_london or close is None: continue
        if not isinstance(close,(int,float)) or isinstance(close,bool) or not 0 < close < 100000 or day.isoformat() in values: raise ValueError('환율 일봉 형식 오류')
        values[day.isoformat()] = close
    points = [{'date': d, 'value':v} for d,v in sorted(values.items())]
    if not points: raise ValueError('완료된 환율 일봉이 없습니다')
    return points
