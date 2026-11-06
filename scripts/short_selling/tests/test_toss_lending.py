import unittest
from scripts.short_selling.toss_lending import parse_records

class TossLendingTests(unittest.TestCase):
    def test_quantity_and_source_time(self):
        payload = {'result': {'records': [{'date': '2026-11-05', 'updatedAt': '2026-11-05T19:00:30+09:00', 'balanceQuantity': '81718770'}]}}
        result = parse_records(payload, '005930', '2026-01-01', '2026-11-05')
        self.assertEqual(result['2026-11-05', '005930']['quantity'], 81718770)
        self.assertEqual(result['2026-11-05', '005930']['updated_at'], '2026-11-05T19:00:30+09:00')

    def test_rejects_invalid_and_duplicate_records(self):
        row = {'date': '2026-11-05', 'updatedAt': '2026-11-05T19:00:30+09:00', 'balanceQuantity': '10'}
        with self.assertRaises(ValueError):
            parse_records({'result': {'records': [row, row]}}, '005930', '2026-01-01', '2026-11-05')
        with self.assertRaises(ValueError):
            parse_records({'result': {'records': [{**row, 'balanceQuantity': '-1'}]}}, '005930', '2026-01-01', '2026-11-05')
