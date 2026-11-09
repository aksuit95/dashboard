"""KRX web index statistics. Range queries are split to avoid server range limits."""
import datetime as dt
import http.cookiejar
import json
import os
import urllib.parse
import urllib.request

ORIGIN = 'https://data.krx.co.kr'
LOGIN = ORIGIN + '/contents/MDC/COMS/client/view/login.jsp?site=mdc'

def _env(root):
    values = dict(os.environ)
    for file in (root / '.env.local', root / '.env'):
        if not file.exists(): continue
        for line in file.read_text(encoding='utf-8-sig').splitlines():
            if '=' not in line or line.lstrip().startswith('#'): continue
            key, value = line.split('=', 1)
            values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return values

def _client(root):
    env = _env(root)
    if not env.get('KRX_ID') or not env.get('KRX_PW'):
        raise ValueError('KRX_ID / KRX_PW 설정이 필요합니다')
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    headers = {'User-Agent':'Mozilla/5.0','Referer':LOGIN,'X-Requested-With':'XMLHttpRequest'}
    def request(url, body=None):
        encoded = urllib.parse.urlencode(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=encoded, headers=headers)
        with opener.open(req, timeout=25) as response: return response.read().decode('utf-8')
    request(LOGIN)
    auth = json.loads(request(ORIGIN + '/contents/MDC/COMS/client/MDCCOMS001D1.cmd', {'mbrId':env['KRX_ID'],'pw':env['KRX_PW'],'skipDup':'Y'}))
    if auth.get('_error_code') != 'CD001': raise ValueError('KRX 웹 로그인 실패')
    return request

def collect(start, end, market, root, request=None):
    if market not in ('KOSPI','KOSDAQ') or start > end: raise ValueError('KRX 지수 요청 오류')
    request = request or _client(root)
    out = {}
    cursor = start
    while cursor <= end:
        through = min(end, cursor + dt.timedelta(days=364))
        body = {'bld':'dbms/MDC/STAT/standard/MDCSTAT00301','locale':'ko_KR','money':'1','share':'1','csvxls_isNo':'false','indIdx':'1' if market == 'KOSPI' else '2','indIdx2':'001','strtDd':cursor.strftime('%Y%m%d'),'endDd':through.strftime('%Y%m%d')}
        result = json.loads(request(ORIGIN + '/comm/bldAttendant/getJsonData.cmd', body))
        rows = result.get('output')
        if not isinstance(rows, list) or not rows: raise ValueError(f'{market} KRX 지수 이력 없음')
        for row in rows:
            day = dt.date.fromisoformat(str(row['TRD_DD']).replace('/','-'))
            value = float(str(row['CLSPRC_IDX']).replace(',',''))
            if not cursor <= day <= through or value <= 0 or day.isoformat() in out: raise ValueError(f'{market} KRX 지수 형식 오류')
            out[day.isoformat()] = value
        cursor = through + dt.timedelta(days=1)
    points = [{'date': day,'value': value} for day,value in sorted(out.items())]
    if len(points) < 20 or points[-1]['date'] != end.isoformat(): raise ValueError(f'{market} 최신 정규장 지수 누락')
    return points
