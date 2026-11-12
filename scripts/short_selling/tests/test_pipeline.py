import json
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.short_selling.collect import collect, publish, read_previous, sample, validate
from scripts.short_selling.model import FIELDS, PRICE, aggregate, build, derive, normalize, ratio, strict_mean
from scripts.short_selling.sources import KST, ROOT, Source, KrxPriceNotPublished, KrxPriceSchemaMismatch, completed_day, known_calendar, number


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads((ROOT / 'config/short-selling.json').read_text(encoding='utf-8'))
        (ROOT / 'tmp').mkdir(exist_ok=True)

    def test_completed_session_intraday_weekend_and_exception(self):
        self.assertEqual(str(completed_day(datetime(2026, 11, 4, 10, tzinfo=KST))), '2026-11-03')
        self.assertEqual(str(completed_day(datetime(2026, 11, 4, 22, tzinfo=KST))), '2026-11-04')
        self.assertEqual(str(completed_day(datetime(2026, 11, 8, 10, tzinfo=KST))), '2026-11-06')
        with self.assertRaises(ValueError):
            completed_day(datetime(2026, 11, 19, 22, tzinfo=KST))
        with self.assertRaises(ValueError):
            completed_day(datetime(2027, 1, 5, 22, tzinfo=KST))

    def test_null_and_zero_are_distinct(self):
        self.assertIsNone(number('-'))
        self.assertEqual(number('0'), 0)
        self.assertEqual(ratio(0, 100), 0)
        self.assertIsNone(ratio(None, 100))
        self.assertIsNone(ratio(0, 0))
        self.assertIsNone(strict_mean([{'v': 0}, {'v': None}], 'v', 2))

    def test_lending_change_uses_same_day_listed_shares_and_latest_observation(self):
        days = ['2026-11-02', '2026-11-03', '2026-11-04']
        snapshots = {}
        for day, quantity, shares in zip(days, [100, 120, None], [1000, 2000, 5000]):
            row = dict.fromkeys(FIELDS)
            row.update(date=day, name='Test', session_status='trading', close=100, listed_shares=shares,
                       lending_quantity=quantity, balance_status='not_disclosed', lending_status='reported' if quantity is not None else 'unavailable', lending_published_at=None)
            snapshots[day] = {'members': ['005930'], 'normalized': {'005930': row}}
        files = build(snapshots, dict.fromkeys(days, 300), days[0], days[-1], self.config, '2026-11-05T09:00:00+09:00')
        loan = files['stocks.json']['stocks'][0]['latest_lending']
        self.assertEqual(loan['as_of'], days[1])
        self.assertEqual(loan['change_shares_pct'], 1.0)
        self.assertEqual(loan['quantity_shares_pct'], 6.0)
        self.assertEqual(files['summary.json']['rankings']['lending_increase'][0]['as_of'], days[1])
        snapshots[days[1]]['normalized']['005930']['listed_shares'] = 0
        files = build(snapshots, dict.fromkeys(days, 300), days[0], days[-1], self.config, '2026-11-05T09:00:00+09:00')
        self.assertIsNone(files['stocks.json']['stocks'][0]['latest_lending']['change_shares_pct'])
        self.assertIsNone(files['stocks.json']['stocks'][0]['latest_lending']['quantity_shares_pct'])
        self.assertEqual(files['summary.json']['rankings']['lending_increase'], [])

    def test_web_prices_validate_market_and_crosscheck_regular_close(self):
        import pandas as pd
        class Response:
            def raise_for_status(self): pass
            def json(self): return {'items': [{'tradingDateKst': '2026-11-04', 'regularMarketClosingPrice': '100', 'closingPrice': '120'}]}
        class Session:
            def get(self, *args, **kwargs): return Response()
        source = Source.__new__(Source)
        source.interval = 0
        source.session = Session()
        rows = [{'ISU_SRT_CD': str(i).zfill(6), 'ISU_ABBRV': 'test', 'MKT_ID': 'STK', 'TDD_CLSPRC': '100', 'ACC_TRDVAL': '1', 'ACC_TRDVOL': '1', 'MKTCAP': '100000', 'LIST_SHRS': '1000'} for i in range(200)]
        source.core = SimpleNamespace(전종목시세=lambda: SimpleNamespace(fetch=lambda *args: pd.DataFrame(rows)))
        self.assertEqual(len(source.prices('20261104')), 200)
        rows[0]['MKT_ID'] = 'KSQ'
        with self.assertRaises(KrxPriceSchemaMismatch): source.prices('20261104')
        rows[0]['MKT_ID'] = 'STK'
        source.session = SimpleNamespace(get=lambda *a, **kw: SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'items': [{'tradingDateKst': '2026-11-04', 'regularMarketClosingPrice': '120'}]}))
        with self.assertRaises(KrxPriceSchemaMismatch): source.prices('20261104')

    def test_market_is_weighted_and_incomplete_never_understates(self):
        rows = {'a': {'short_value': 20, 'trading_value': 100, 'short_volume': 2, 'volume': 10},
                'b': {'short_value': 10, 'trading_value': 900, 'short_volume': 1, 'volume': 90}}
        market = aggregate('2026-11-03', ['a', 'b'], rows, 300)
        self.assertEqual(market['short_value_ratio_pct'], 3)
        market = aggregate('2026-11-03', ['a', 'b', 'c'], rows, 300)
        self.assertEqual(market['coverage'], 'incomplete')
        self.assertIsNone(market['short_value'])
        self.assertIsNone(market['short_value_ratio_pct'])

    def test_prior_session_means_and_covering(self):
        rows = [{'short_value_ratio_pct': 10, 'short_volume_ratio_pct': 10, 'short_value': 100, 'close': 100} for _ in range(20)]
        rows.append({'short_value_ratio_pct': 2, 'short_volume_ratio_pct': 2, 'short_value': 20, 'close': 110})
        derived = derive(rows, self.config)
        self.assertEqual(derived['short_value_ratio_pct_mean_20'], 10)
        self.assertTrue(derived['short_cover_signal'])
        rows[-2]['short_value_ratio_pct'] = None
        derived = derive(rows, self.config)
        self.assertIsNone(derived['surge'])
        self.assertIsNone(derived['short_cover_signal'])

    def test_missing_balance_is_null_and_price_is_official_only(self):
        raw = {'members': ['005930'], 'prices': [{'ISU_CD': '005930', 'ISU_NM': 'Samsung', 'TDD_CLSPRC': '60000', 'MKTCAP': '1000000', 'LIST_SHRS': '100'}],
               'short': [{'ISU_CD': '005930', 'CVSRTSELL_TRDVOL': '0', 'CVSRTSELL_TRDVAL': '0', 'ACC_TRDVOL': '100', 'ACC_TRDVAL': '6000000'}], 'balance': []}
        row = normalize('2026-11-03', raw)['005930']
        self.assertEqual(row['short_value'], 0)
        self.assertIsNone(row['balance_ratio_pct'])
        self.assertEqual(row['balance_status'], 'not_disclosed')
        raw['prices'][0].pop('TDD_CLSPRC')
        raw['prices'][0]['closingPrice'] = 65000
        with self.assertRaises(KeyError):
            normalize('2026-11-03', raw)

    def test_sample_schema_and_calendar_nulls(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'tmp') as tmp:
            sample(self.config, tmp)
            files = {str(p.relative_to(tmp)).replace('\\', '/'): json.loads(p.read_text(encoding='utf-8')) for p in Path(tmp).rglob('*.json')}
            validate(files)
            self.assertTrue(files['summary.json']['is_sample'])
            self.assertEqual(files['summary.json']['price_basis'], PRICE)
            self.assertEqual(files['summary.json']['market']['expected_count'], 2)
            stock = files['stocks.json']['stocks'][0]
            self.assertIsNone(stock['balance_ratio_pct'])
            self.assertIsNotNone(stock['latest_disclosed_balance'])
            self.assertTrue(any(r['short_value'] is None for r in files['market_history.json']['rows']))
            with self.assertRaises(ValueError):
                read_previous(Path(tmp))

    def test_all_files_preserved_on_validation_or_mid_write_failure(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'tmp') as tmp:
            sample(self.config, tmp)
            files = {str(p.relative_to(tmp)).replace('\\', '/'): json.loads(p.read_text(encoding='utf-8')) for p in Path(tmp).rglob('*.json')}
            before = {p: p.read_bytes() for p in Path(tmp).rglob('*.json')}
            invalid = dict(files)
            invalid['stocks.json'] = {**files['stocks.json'], 'price_basis': {**PRICE, 'exchange': 'NXT'}}
            with self.assertRaises(Exception):
                publish(invalid, Path(tmp))
            self.assertTrue(all(p.read_bytes() == b for p, b in before.items()))
            import os
            original = os.replace
            count = 0
            def fail_second(src, dest):
                nonlocal count
                count += 1
                if count == 2:
                    raise OSError('simulated disk error')
                return original(src, dest)
            with patch('scripts.short_selling.collect.os.replace', side_effect=fail_second):
                with self.assertRaises(OSError):
                    publish(files, Path(tmp))
            self.assertTrue(all(p.read_bytes() == b for p, b in before.items()))

    def test_backfill_then_increment_and_source_failure_preserves_generation(self):
        end = date(2026, 11, 3)
        start = end - timedelta(days=365)
        _, holidays, _ = known_calendar()
        days = [start + timedelta(days=i) for i in range(366)]
        days = [d for d in days if d.weekday() < 5 and d.isoformat() not in holidays]
        index = [{'TRD_DD': d.isoformat(), 'CLSPRC_IDX': '300'} for d in days]
        price = [{'ISU_CD': '005930', 'ISU_NM': 'Test', 'TDD_CLSPRC': '60000', 'MKTCAP': '1000000', 'LIST_SHRS': '100'}]
        flow = [{'ISU_CD': '005930', 'CVSRTSELL_TRDVOL': '10', 'CVSRTSELL_TRDVAL': '600000', 'ACC_TRDVOL': '100', 'ACC_TRDVAL': '6000000'}]
        with tempfile.TemporaryDirectory(dir=ROOT / 'tmp') as tmp:
            root = Path(tmp)
            (root / 'schemas').mkdir()
            (root / 'schemas/short-selling.schema.json').write_bytes((ROOT / 'schemas/short-selling.schema.json').read_bytes())
            args = SimpleNamespace(as_of=None, backfill=True, output=str(root / 'data'), lending_csv=None)
            with patch('scripts.short_selling.collect.ROOT', root), patch('scripts.short_selling.collect.completed_day', return_value=end), patch('scripts.short_selling.collect.log'), patch('scripts.short_selling.collect.Source') as factory:
                source = factory.return_value
                source.index.return_value = index
                source.members.return_value = ['005930']
                source.prices.return_value = price
                source.short.return_value = flow
                source.balance.return_value = []
                collect(args, self.config)
                self.assertEqual(source.prices.call_count, len(days))
                args.backfill = False
                lending = root / 'lending.csv'
                lending.write_text('date,code,source,published_at,quantity\n2026-11-03,005930,SEIBro,2026-11-03T18:00:00+09:00,12345\n', encoding='utf-8')
                args.lending_csv = str(lending)
                collect(args, self.config)
                args.lending_csv = None
                source.reset_mock()
                collect(args, self.config)
                self.assertEqual(source.prices.call_count, self.config['refresh_sessions'])
                stock = json.loads((root / 'data/stocks.json').read_text(encoding='utf-8'))['stocks'][0]
                self.assertEqual(stock['lending_quantity'], 12345)
                summary = json.loads((root / 'data/summary.json').read_text(encoding='utf-8'))
                self.assertFalse(summary['is_sample'])
                self.assertEqual(summary['market']['short_value_ratio_pct'], 10)
                history = json.loads((root / 'data/history/005930.json').read_text(encoding='utf-8'))
                exceptional = next(row for row in history['rows'] if row['date'] == '2025-11-13')
                self.assertIsNone(exceptional['close'])
                self.assertIsNone(exceptional['market_cap'])
                before = {p: p.read_bytes() for p in (root / 'data').rglob('*.json')}
                source.prices.side_effect = RuntimeError('simulated source denial')
                with self.assertRaises(RuntimeError):
                    collect(args, self.config)
                self.assertTrue(all(p.read_bytes() == b for p, b in before.items()))


if __name__ == '__main__':
    unittest.main()
