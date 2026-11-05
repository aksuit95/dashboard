"""Source adapters preserve raw missing markers; never use pykrx's fill-zero wrappers."""
from __future__ import annotations

import contextlib
import io
import math
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parents[2]


class KrxPriceNotPublished(ValueError):
    """The official endpoint returned a valid but empty observation list."""


class KrxPriceSchemaMismatch(ValueError):
    """The official endpoint changed its envelope, fields, or date."""


def load_env():
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env.local", override=False)
    load_dotenv(ROOT / ".env", override=False)


def number(value):
    if value is None or str(value).strip() in ("", "-", "--", "nan", "None"):
        return None
    value = float(str(value).replace(",", ""))
    if not math.isfinite(value):
        raise ValueError("Non-finite source number")
    return int(value) if value.is_integer() else value


def records(frame, required, allow_empty=False):
    if not set(required).issubset(frame.columns):
        raise ValueError("Source schema mismatch: " + ",".join(required))
    if frame.empty and not allow_empty:
        raise ValueError("Empty required source")
    return frame.where(frame.notna(), None).to_dict("records")


class Source:
    def __init__(self, interval=1):
        load_env()
        import requests
        # pykrx uses requests sessions internally, including its login requests.
        # A finite timeout also applies to those requests.
        original = requests.sessions.Session.request
        if not getattr(original, "_shorting_timeout", False):
            def bounded(session, method, url, **kwargs):
                kwargs.setdefault("timeout", (10, 25))
                return original(session, method, url, **kwargs)
            bounded._shorting_timeout = True
            requests.sessions.Session.request = bounded
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from pykrx import stock
            from pykrx.website.krx.market import core
        self.stock, self.core = stock, core
        self.session = requests.Session()
        self.interval = interval

    def call(self, fn, *args, **kwargs):
        time.sleep(self.interval)
        # Do not emit library login messages / server response bodies into logs.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return fn(*args, **kwargs)

    def index(self, start, end):
        frame = self.call(self.core.개별지수시세().fetch, "028", "1", start, end)
        return records(frame, ["TRD_DD", "CLSPRC_IDX"])

    def members(self, day):
        codes = self.call(self.stock.get_index_portfolio_deposit_file, "1028", date=day)
        if not 190 <= len(codes) <= 210 or len(set(codes)) != len(codes):
            raise ValueError("Unexpected KOSPI200 membership")
        if any(not re.fullmatch(r"[0-9A-Z]{6}", c) for c in codes):
            raise ValueError("Invalid ticker")
        return sorted(codes)

    def short(self, day):
        frame = self.call(self.core.개별종목_공매도_거래_전종목().fetch, day, "STK", ["STMFRTSCIFDRFS"])
        return records(frame, ["ISU_CD", "ISU_ABBRV", "CVSRTSELL_TRDVOL", "ACC_TRDVOL", "CVSRTSELL_TRDVAL", "ACC_TRDVAL", "TRDVOL_WT", "TRDVAL_WT"])

    def balance(self, day):
        # Retain the JSON envelope: a valid empty list differs from a blocked HTML
        # response or a renamed field. DataFrame wrappers lose that distinction.
        payload = self.call(self.core.전종목_공매도_잔고().read, trdDd=day, mktTpCd=1)
        rows = payload.get("OutBlock_1")
        fields = {"ISU_CD", "BAL_QTY", "BAL_AMT", "BAL_RTO"}
        if not isinstance(rows, list) or any(not fields.issubset(r) for r in rows):
            raise ValueError("Balance source schema mismatch")
        return rows

    def prices(self, day):
        if not re.fullmatch(r"\d{8}", day):
            raise KrxPriceSchemaMismatch("Invalid requested session")
        frame = self.call(self.core.전종목시세().fetch, day, "STK")
        fields = ["ISU_SRT_CD", "ISU_ABBRV", "MKT_ID", "TDD_CLSPRC", "ACC_TRDVAL", "ACC_TRDVOL", "MKTCAP", "LIST_SHRS"]
        raw = records(frame, fields)
        if len(raw) < 190:
            raise KrxPriceNotPublished("KRX web market observation incomplete")
        rows, seen = [], set()
        for item in raw:
            code = str(item["ISU_SRT_CD"])
            if not re.fullmatch(r"[0-9A-Z]{6}", code) or code in seen or item["MKT_ID"] != "STK":
                raise KrxPriceSchemaMismatch("KRX web ticker or market mismatch")
            seen.add(code)
            close, cap, shares = (number(item[k]) for k in ("TDD_CLSPRC", "MKTCAP", "LIST_SHRS"))
            # Some corporate actions make capitalization inconsistent on the
            # reference date. Keep that individual metric missing, not zero.
            if not close or not cap or not shares or close * shares != cap:
                cap = None
            rows.append({**item, "ISU_CD": code, "ISU_NM": item["ISU_ABBRV"], "MKTCAP": cap})
        candidates = sorted((r for r in rows if r["MKTCAP"] is not None and number(r["TDD_CLSPRC"]) > 0), key=lambda r: r["MKTCAP"], reverse=True)[:10]
        if len(candidates) < 10:
            raise KrxPriceNotPublished("KRX web verification candidates missing")
        iso = f"{day[:4]}-{day[4:6]}-{day[6:]}"
        for row in candidates:
            response = self.session.get(f"https://stock.naver.com/api/stockSecurity/items/v2/domestic/{row['ISU_CD']}/daily-prices/paged?size=100&index=0", headers={"user-agent": "Mozilla/5.0"}, timeout=25)
            response.raise_for_status()
            data = response.json()
            items = data.get("items") if isinstance(data, dict) else None
            matches = [r for r in items if isinstance(r, dict) and r.get("tradingDateKst") == iso] if isinstance(items, list) else []
            if len(matches) != 1 or number(matches[0].get("regularMarketClosingPrice")) != number(row["TDD_CLSPRC"]):
                raise KrxPriceSchemaMismatch("KRX regular closing price cross-check failed")
        return rows

    def pykrx_prices(self, day):
        # Independent probe for the pykrx convenience adapter.
        frame = self.call(self.stock.get_market_ohlcv_by_ticker, day, market="KOSPI")
        records(frame, ["종가", "거래대금"])
        return {"rows": len(frame), "columns": list(frame.columns)}

def known_calendar():
    """Share the repository's explicitly reviewed calendar, including uncertain dates."""
    text = (ROOT / "config/market-calendar.ts").read_text(encoding="utf-8")
    year = int(re.search(r"CALENDAR_YEAR = (\d{4})", text)[1])
    holidays = text.split("export const KR_HOLIDAYS", 1)[1].split("};", 1)[0]
    uncertain = text.split("export const KR_UNCONFIRMED", 1)[1].split("};", 1)[0]
    return year, set(re.findall(r'"(\d{4}-\d{2}-\d{2})"', holidays)), set(re.findall(r'"(\d{4}-\d{2}-\d{2})"', uncertain))


def completed_day(now=None):
    now = now or datetime.now(KST)
    year, holidays, uncertain = known_calendar()
    day = now.date()
    if (now.hour, now.minute) < (15, 30):
        day -= timedelta(days=1)
    for _ in range(20):
        if day.year != year:
            raise ValueError("Reviewed KRX calendar must be updated")
        if day.isoformat() in uncertain:
            raise ValueError("Unverified exceptional KRX session: " + day.isoformat())
        if day.weekday() < 5 and day.isoformat() not in holidays:
            return day
        day -= timedelta(days=1)
    raise ValueError("No completed session in reviewed calendar")
