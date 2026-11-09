import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import adr
import fx
import krx
import session
import collect
import us

class TestMarketIndicators(unittest.TestCase):
    def test_session_respects_cutoff_weekend_and_holiday(self):
        utc=dt.timezone.utc
        self.assertEqual(session.latest_session(dt.datetime(2026,11,9,6,59,tzinfo=utc)).isoformat(),'2026-11-06')
        self.assertEqual(session.latest_session(dt.datetime(2026,11,9,7,0,tzinfo=utc)).isoformat(),'2026-11-09')
        self.assertEqual(session.latest_session(dt.datetime(2026,10,5,8,0,tzinfo=utc)).isoformat(),'2026-10-02')
        with self.assertRaises(ValueError): session.latest_session(dt.datetime(2026,11,19,8,0,tzinfo=utc))
    def test_krx_parses_only_explicit_web_close_and_checks_latest(self):
        start=dt.date(2026,1,1); end=dt.date(2026,1,25)
        rows=[{'TRD_DD':(start+dt.timedelta(days=i)).strftime('%Y/%m/%d'),'CLSPRC_IDX':str(1000+i)} for i in range(25)]
        def request(url, body):
            self.assertEqual(body['indIdx2'],'001')
            return json.dumps({'output':rows})
        data=krx.collect(start,end,'KOSPI',Path('.'),request)
        self.assertEqual(data[-1],{'date':'2026-01-25','value':1024.0})
        with self.assertRaises(ValueError): krx.collect(start,end,'KOSPI',Path('.'),lambda u,b:json.dumps({'output':rows[:-1]}))
    def test_fx_excludes_current_london_session_and_validates_currency(self):
        start=dt.date(2026,11,5); end=dt.date(2026,11,9); now=dt.datetime(2026,11,9,8,tzinfo=dt.timezone.utc)
        ts=lambda d:int(dt.datetime.fromisoformat(d).replace(tzinfo=dt.timezone.utc).timestamp())
        result={'chart':{'result':[{'meta':{'symbol':'KRW=X','currency':'KRW','exchangeTimezoneName':'Europe/London'},'timestamp':[ts('2026-11-06'),ts('2026-11-09')],'indicators':{'quote':[{'close':[1400,1401]}]}}]}}
        points=fx.collect(start,end,now,lambda _:result)
        self.assertEqual(points,[{'date':'2026-11-06','value':1400}])
        result['chart']['result'][0]['meta']['currency']='USD'
        with self.assertRaises(ValueError): fx.collect(start,end,now,lambda _:result)
    def test_adr_reuses_existing_publication_only_at_matching_date(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); (root/'data/adr').mkdir(parents=True)
            obj={'version':1,'source':'NAVER_KRX_REGULAR','asOf':'2026-11-06','fetchedAt':'2026-11-06T07:00:00Z','markets':{'KOSPI':{'days':[{'date':'2026-11-06','value':80}]}}}
            (root/'data/adr/board.json').write_text(json.dumps(obj),encoding='utf-8')
            self.assertEqual(adr.collect(dt.date(2026,1,1),dt.date(2026,11,6),'KOSPI',root)[0][0]['value'],80)
            with self.assertRaises(ValueError): adr.collect(dt.date(2026,1,1),dt.date(2026,11,9),'KOSPI',root)
    def test_failed_source_keeps_previous_data(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)
            with patch.object(collect,'DEST',target), patch.object(collect.krx,'collect',side_effect=ValueError('network')), patch.object(collect.adr,'collect',side_effect=ValueError('missing')), patch.object(collect.fx,'collect',side_effect=ValueError('network')):
                (target/'kospi.json').write_text('[{"date":"2026-11-05","value":100}]',encoding='utf-8')
                (target/'kospi.meta.json').write_text('{"asOf":"2026-11-05","fetchedAt":"2026-11-05T08:00:00Z"}',encoding='utf-8')
                failures=collect.run(now=dt.datetime(2026,11,9,0,0,tzinfo=dt.timezone.utc), only={'kospi','kosdaq','adr_kospi','adr_kosdaq','usdkrw'})
                self.assertEqual(len(failures),5)
                self.assertEqual(json.loads((target/'kospi.json').read_text())[0]['value'],100)
                meta=json.loads((target/'kospi.meta.json').read_text(encoding='utf-8'))
                self.assertEqual(meta['status'],'error'); self.assertEqual(meta['asOf'],'2026-11-05')
    def test_index_collection_only_appends_to_existing_krx_history(self):
        original = json.loads((collect.DEST/'kospi.json').read_text(encoding='utf-8'))
        last = original[-1]
        later = {'date':'2026-11-09','value':last['value']+1}
        with patch.object(collect.krx,'collect',return_value=[last,later]) as source, patch.object(collect,'atomic') as write:
            self.assertEqual(collect.run(now=dt.datetime(2026,11,9,8,tzinfo=dt.timezone.utc),only={'kospi'}),[])
            self.assertEqual(source.call_args.args[0],dt.date.fromisoformat(last['date']))
            self.assertEqual(write.call_args_list[0].args[1], original+[later])

    def test_us_only_does_not_depend_on_krx_calendar_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)
            now = dt.datetime(2026,11,9,0,0,tzinfo=dt.timezone.utc)
            points = [{'date':'2026-11-06','value':25000}]
            (target/'nasdaq.json').write_text(json.dumps(points),encoding='utf-8')
            (target/'nasdaq.meta.json').write_text(json.dumps({'status':'ok','source':'Yahoo Finance ^IXIC','basis':'미국 정규장 종가 · 뉴욕 거래일 (ET)','asOf':'2026-11-06'}),encoding='utf-8')
            with patch.object(collect,'DEST',target), patch.object(session,'latest_session',side_effect=ValueError('KRX calendar')), patch.object(us,'collect_index',return_value=points):
                self.assertEqual(collect.run(now=now,only={'nasdaq'}),[])
                before = (target/'nasdaq.meta.json').read_bytes()
                self.assertEqual(collect.run(now=now+dt.timedelta(hours=1),only={'nasdaq'}),[])
                self.assertEqual((target/'nasdaq.meta.json').read_bytes(),before)
                self.assertFalse((target/'kospi.json').exists())
    def test_us_index_excludes_intraday_and_uses_new_york_dates(self):
        utc=dt.timezone.utc
        ts=lambda s:int(dt.datetime.fromisoformat(s).replace(tzinfo=utc).timestamp())
        sample={'chart':{'result':[{'meta':{'symbol':'^IXIC','currency':'USD','exchangeTimezoneName':'America/New_York','instrumentType':'INDEX'},'timestamp':[ts('2026-11-06T14:30:00'),ts('2026-11-09T14:30:00')],'indicators':{'quote':[{'close':[25000,26000]}]}}]}}
        start,end=dt.date(2026,11,1),dt.date(2026,11,9)
        data=us.collect_index(start,end,'^IXIC',dt.datetime(2026,11,9,19,tzinfo=utc),lambda _:sample)
        self.assertEqual(data,[{'date':'2026-11-06','value':25000}])
        data=us.collect_index(start,end,'^IXIC',dt.datetime(2026,11,9,23,tzinfo=utc),lambda _:sample)
        self.assertEqual(data[-1]['date'],'2026-11-09')
        self.assertEqual(us.eastern_time(ts('2026-03-08T06:59:00')).hour,1)
        self.assertEqual(us.eastern_time(ts('2026-03-08T07:00:00')).hour,3)
    def test_treasury_reads_rate_not_price(self):
        xml=b'''<feed xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"><m:properties><d:NEW_DATE>2026-11-06T00:00:00</d:NEW_DATE><d:BC_10YEAR>4.86</d:BC_10YEAR><d:BC_2YEAR>4.51</d:BC_2YEAR></m:properties></feed>'''
        data=us.collect_treasury(dt.date(2026,1,1),dt.date(2026,11,6),'10',lambda _:xml)
        self.assertEqual(data,[{'date':'2026-11-06','value':4.86}])
if __name__=='__main__': unittest.main()
