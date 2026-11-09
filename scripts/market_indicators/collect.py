"""Collect independent series and atomically publish validated daily JSON files."""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import tempfile
import adr
import fx
import krx
import session
import us

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'public/data/market-indicators-live'

def validate(points, start, end, allow_zero=False):
    if not isinstance(points, list) or not points: raise ValueError('데이터가 비어 있습니다')
    previous = ''
    for row in points:
        date, value = row.get('date'), row.get('value')
        try: d = dt.date.fromisoformat(date)
        except (ValueError, TypeError): raise ValueError('날짜 형식 오류')
        if date != d.isoformat() or not start <= d <= end or date <= previous or isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value < 0 or (value == 0 and not allow_zero): raise ValueError('값·날짜 순서 오류')
        previous = date
    return points

def atomic(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=file.parent, delete=False) as handle:
            name = handle.name
            json.dump(value, handle, ensure_ascii=False, separators=(',',':'), allow_nan=False)
            handle.write('\n')
        os.replace(name, file)
    finally:
        if name and os.path.exists(name): os.unlink(name)

def run(end=None, now=None, only=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    us_end = us.eastern_time(now.timestamp()).date()
    us_only = only is not None and only <= {'nasdaq','sp500','us10y','us2y'}
    if us_only:
        if end is not None: raise ValueError('미국 지표에는 --through를 사용할 수 없습니다')
        end = us_end
    else:
        completed = session.latest_session(now)
        if end is not None and end != completed: raise ValueError('완료된 최신 KRX 거래일과 요청 기준일 불일치')
        end = completed
    try: start = end.replace(year=end.year-5)
    except ValueError: start = end.replace(year=end.year-5, day=28)
    stamp = now.isoformat()
    sources = {
      'kospi': ('KRX 정보데이터시스템', 'KRX 정규장 15:30 KST', lambda: (krx.collect(start,end,'KOSPI',ROOT), stamp)),
      'kosdaq': ('KRX 정보데이터시스템', 'KRX 정규장 15:30 KST', lambda: (krx.collect(start,end,'KOSDAQ',ROOT), stamp)),
      'adr_kospi': ('네이버 KRX 일봉 자체 계산', 'KRX 정규장 15:30 KST · 20거래일', lambda: adr.collect(start,end,'KOSPI',ROOT)),
      'adr_kosdaq': ('네이버 KRX 일봉 자체 계산', 'KRX 정규장 15:30 KST · 20거래일', lambda: adr.collect(start,end,'KOSDAQ',ROOT)),
      'usdkrw': ('Yahoo Finance KRW=X', '런던 시간 기준 완료된 일별 환율 · KRX 종가 아님', lambda: (fx.collect(start,end,now),stamp)),
    }
    sources.update({
      'nasdaq': ('Yahoo Finance ^IXIC', '미국 정규장 종가 · 뉴욕 거래일 (ET)', lambda: (us.collect_index(start,us_end,'^IXIC',now),stamp)),
      'sp500': ('Yahoo Finance ^GSPC', '미국 정규장 종가 · 뉴욕 거래일 (ET)', lambda: (us.collect_index(start,us_end,'^GSPC',now),stamp)),
      'us10y': ('미국 재무부', '10년 만기 국채 파 수익률(%) · 뉴욕 약 15:30 호가 기준', lambda: (us.collect_treasury(start,us_end,'10'),stamp)),
      'us2y': ('미국 재무부', '2년 만기 국채 파 수익률(%) · 뉴욕 약 15:30 호가 기준', lambda: (us.collect_treasury(start,us_end,'2'),stamp)),
    })
    failures = []
    for name,(source,basis,collect) in sources.items():
        if only is not None and name not in only: continue
        datafile = DEST / f'{name}.json'; metafile = DEST / f'{name}.meta.json'
        try:
            points, fetched = collect()
            if name not in ('adr_kospi','adr_kosdaq'):
                fetched = dt.datetime.now(dt.timezone.utc).isoformat()
            validate(points,start,us_end if name in ('nasdaq','sp500','us10y','us2y') else end, allow_zero=name in ('us10y','us2y'))
            try:
                old_points = json.loads(datafile.read_text(encoding='utf-8'))
                old_meta = json.loads(metafile.read_text(encoding='utf-8'))
            except (FileNotFoundError, ValueError):
                old_points, old_meta = None, {}
            if (old_points == points and old_meta.get('status') == 'ok'
                and old_meta.get('source') == source and old_meta.get('basis') == basis
                and old_meta.get('asOf') == points[-1]['date']):
                print(f'{name}: 변경 없음')
                continue
            atomic(datafile,points)
            atomic(metafile, {'status':'ok','source':source,'basis':basis,'asOf':points[-1]['date'],'fetchedAt':fetched,'coverageStart':points[0]['date'],'checkedAt':stamp})
            print(f"{name}: {len(points)}일 {points[0]['date']} ~ {points[-1]['date']}")
        except Exception as e:
            failures.append(name)
            previous = {}
            try: previous = json.loads(metafile.read_text(encoding='utf-8'))
            except (FileNotFoundError,ValueError): pass
            if not datafile.exists(): atomic(datafile,[])
            atomic(metafile, {**previous,'status':'error','source':source,'basis':basis,'checkedAt':stamp,'error':str(e)})
            print(f'{name}: 수집 실패 · 기존 결과 유지 · {e}')
    return failures

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='KRX 정규장 및 환율 이력을 수집합니다')
    parser.add_argument('--through', help='최신 완료 거래일 확인용 YYYY-MM-DD')
    parser.add_argument('--only', nargs='+', choices=['kospi','kosdaq','adr_kospi','adr_kosdaq','usdkrw','nasdaq','sp500','us10y','us2y'])
    args = parser.parse_args()
    try:
        bad = run(dt.date.fromisoformat(args.through) if args.through else None, only=set(args.only) if args.only else None)
        raise SystemExit(1 if bad else 0)
    except Exception as error:
        print(f'수집 중단: {error}')
        raise SystemExit(1)
