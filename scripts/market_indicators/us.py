"""US index closes from Yahoo and official Treasury constant-maturity par yields."""
import datetime as dt
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UTC = dt.timezone.utc

def eastern_time(timestamp):
    utc = dt.datetime.fromtimestamp(timestamp, UTC)
    def nth_sunday(year, month, ordinal):
        first = dt.date(year,month,1)
        return 1 + ((6-first.weekday()) % 7) + 7*(ordinal-1)
    begin=dt.datetime(utc.year,3,nth_sunday(utc.year,3,2),7,tzinfo=UTC)
    end=dt.datetime(utc.year,11,nth_sunday(utc.year,11,1),6,tzinfo=UTC)
    return utc + dt.timedelta(hours=-4 if begin <= utc < end else -5)

def collect_index(start, end, symbol, now=None, fetch=None):
    if symbol not in ('^IXIC','^GSPC'): raise ValueError('미국 지수 심볼 오류')
    now=now or dt.datetime.now(UTC)
    p1=int(dt.datetime.combine(start-dt.timedelta(days=2),dt.time(),UTC).timestamp())
    p2=int(dt.datetime.combine(end+dt.timedelta(days=2),dt.time(),UTC).timestamp())
    url='https://query1.finance.yahoo.com/v8/finance/chart/'+urllib.parse.quote(symbol,safe='')+'?'+urllib.parse.urlencode({'period1':p1,'period2':p2,'interval':'1d'})
    if fetch is None:
        def fetch(u):
            req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(req,timeout=30) as r: return json.load(r)
    result=fetch(url)['chart']['result'][0]; meta=result['meta']
    if meta.get('symbol') != symbol or meta.get('currency') != 'USD' or meta.get('exchangeTimezoneName') != 'America/New_York' or meta.get('instrumentType') != 'INDEX': raise ValueError('미국 지수 심볼·시간대 오류')
    timestamps=result['timestamp']; closes=result['indicators']['quote'][0]['close']
    if len(timestamps)!=len(closes): raise ValueError('미국 지수 일봉 길이 불일치')
    ny_now=eastern_time(now.timestamp()); values={}
    for stamp,close in zip(timestamps,closes):
        day=eastern_time(stamp).date()
        if not start <= day <= end or close is None or day > ny_now.date() or (day == ny_now.date() and ny_now.hour < 17): continue
        if not isinstance(close,(int,float)) or isinstance(close,bool) or close<=0 or day.isoformat() in values: raise ValueError('미국 지수 날짜·값 오류')
        values[day.isoformat()]=close
    points=[{'date':d,'value':v} for d,v in sorted(values.items())]
    if not points: raise ValueError('확정된 미국 지수 종가 없음')
    return points

NS={'m':'http://schemas.microsoft.com/ado/2007/08/dataservices/metadata','d':'http://schemas.microsoft.com/ado/2007/08/dataservices'}
def collect_treasury(start, end, maturity, fetch=None):
    fields={'10':'BC_10YEAR','2':'BC_2YEAR'}
    if maturity not in fields: raise ValueError('국채 만기 오류')
    if fetch is None:
        def fetch(u):
            req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(req,timeout=30) as r: return r.read()
    values={}
    for year in range(start.year,end.year+1):
        url='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?'+urllib.parse.urlencode({'data':'daily_treasury_yield_curve','field_tdr_date_value':year})
        rows=ET.fromstring(fetch(url)).findall('.//m:properties',NS)
        if not rows: raise ValueError(f'미 재무부 {year} 금리 이력 없음')
        for row in rows:
            raw_date=row.findtext('d:NEW_DATE',namespaces=NS)
            raw_value=row.findtext('d:'+fields[maturity],namespaces=NS)
            if not raw_date or raw_value is None or not raw_value.strip(): continue
            day=dt.date.fromisoformat(raw_date[:10]); value=float(raw_value)
            if not start <= day <= end: continue
            if value < 0 or value > 100 or day.isoformat() in values: raise ValueError('미 국채금리 값·날짜 오류')
            values[day.isoformat()]=value
    points=[{'date':d,'value':v} for d,v in sorted(values.items())]
    if not points: raise ValueError('미 국채금리 이력 없음')
    return points
