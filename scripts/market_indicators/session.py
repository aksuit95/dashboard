"""KRX trading-day policy shared with the TypeScript dashboard calendar."""
import datetime as dt
import re
from pathlib import Path

KST = dt.timezone(dt.timedelta(hours=9))
ROOT = Path(__file__).resolve().parents[2]

def latest_session(now=None):
    text = (ROOT / 'config/market-calendar.ts').read_text(encoding='utf-8')
    year = int(re.search(r'CALENDAR_YEAR\s*=\s*(\d{4})', text).group(1))
    holidays = set(re.findall(r'"(\d{4}-\d{2}-\d{2})"\s*:', text.split('export const KR_HOLIDAYS', 1)[1].split('};', 1)[0]))
    unconfirmed = set(re.findall(r'"(\d{4}-\d{2}-\d{2})"\s*:', text.split('export const KR_UNCONFIRMED', 1)[1].split('};', 1)[0]))
    clock = (now or dt.datetime.now(dt.timezone.utc)).astimezone(KST)
    day = clock.date() - dt.timedelta(days=clock.hour < 16)
    for _ in range(15):
        value = day.isoformat()
        if day.year != year:
            raise ValueError('한국 거래 캘린더 업데이트 필요')
        if day.weekday() < 5 and value not in holidays:
            if value in unconfirmed:
                raise ValueError(f'{value} 특별 운영시간 확인 필요')
            return day
        day -= dt.timedelta(days=1)
    raise ValueError('최근 한국 거래일 확인 실패')
