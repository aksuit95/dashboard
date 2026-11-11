import importlib.util
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', 'scripts/us-sectors/collect.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTest(unittest.TestCase):
    def test_classification_uses_actual_industry(self):
        self.assertEqual(collector.classify('Semiconductor Equipment', 'Information Technology', 'AMAT'), '반도체 장비')
        self.assertEqual(collector.classify('Semiconductors', 'Technology', 'NVDA'), '반도체')
        self.assertEqual(collector.classify('Industrial Machinery', 'Technology', 'ASML'), '반도체 장비')
        self.assertEqual(collector.classify('Biotechnology', 'Health Care', 'AMGN'), '제약·바이오')
    def test_session_completes_at_regular_close(self):
        before = collector.eastern(datetime(2026,11,10,20,59,tzinfo=timezone.utc))
        after = collector.eastern(datetime(2026,11,10,21,10,tzinfo=timezone.utc))
        self.assertFalse(collector.is_completed_session('2026-11-10', before))
        self.assertTrue(collector.is_completed_session('2026-11-10', after))
        self.assertTrue(collector.is_completed_session('2026-11-09', before))
    def test_us_daylight_transition(self):
        self.assertEqual(collector.eastern(datetime(2026,3,8,6,59,tzinfo=timezone.utc)).utcoffset().total_seconds(), -18000)
        self.assertEqual(collector.eastern(datetime(2026,3,8,7,0,tzinfo=timezone.utc)).utcoffset().total_seconds(), -14400)
        self.assertEqual(collector.eastern(datetime(2026,11,1,6,0,tzinfo=timezone.utc)).utcoffset().total_seconds(), -18000)
if __name__ == '__main__': unittest.main()
