import unittest
from unittest.mock import patch

from scripts.short_selling.market_alerts import fetch


class Response:
    def __init__(self, value):
        self.value = value

    def raise_for_status(self):
        pass

    def json(self):
        return self.value


class Session:
    def __init__(self, pages):
        self.pages = pages

    def get(self, url, params, **kwargs):
        return Response(self.pages.get((params['orderType'], params.get('alertType'), params['startIdx']), []))


class MarketAlertTests(unittest.TestCase):
    @patch('scripts.short_selling.market_alerts.time.sleep')
    def test_collects_all_alert_levels_and_pages(self, _sleep):
        first = [{'itemcode': f'{i:06d}', 'marketAlertType': '01'} for i in range(100)]
        pages = {('marketAlertType', '01', 0): first, ('marketAlertType', '01', 1): [{'itemcode': '000100', 'marketAlertType': '01'}],
                 ('marketAlertType', '02', 0): [{'itemcode': '0126Z0', 'marketAlertType': '02'}],
                 ('statusTag', None, 0): [{'itemcode': '0126Z0', 'manageStatusGb': '1'}, {'itemcode': '001527', 'manageStatusGb': '2'}],
                 ('tradeStopYn', None, 0): [{'itemcode': '0126Z0', 'tradeStopYn': 'Y'}]}
        snapshot = fetch(Session(pages))
        self.assertEqual(len(snapshot['alerts']), 103)
        self.assertEqual(snapshot['alerts']['000100'], ['투자주의'])
        self.assertEqual(snapshot['alerts']['0126Z0'], ['투자경고', '관리', '거래정지'])
        self.assertEqual(snapshot['alerts']['001527'], ['관리'])
        self.assertTrue(snapshot['observed_at'].endswith('+09:00'))

    @patch('scripts.short_selling.market_alerts.time.sleep')
    def test_rejects_changed_or_ignored_filter(self, _sleep):
        with self.assertRaises(ValueError):
            fetch(Session({('marketAlertType', '01', 0): [{'itemcode': '005930', 'marketAlertType': '02'}]}))
        with self.assertRaises(ValueError):
            fetch(Session({('marketAlertType', '01', 0): [{'itemcode': 'bad', 'marketAlertType': '01'}]}))
        with self.assertRaises(ValueError):
            fetch(Session({('tradeStopYn', None, 0): [{'itemcode': '005930', 'tradeStopYn': 'N'}]}))
