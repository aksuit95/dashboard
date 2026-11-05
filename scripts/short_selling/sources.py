"""Source adapters preserve raw missing markers; never use pykrx's fill-zero wrappers."""
from __future__ import annotations

import contextlib
import io
import math
import os
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
        key = os.environ.get("KRX_API_KEY")
        if not key:
            raise RuntimeError("KRX_API_KEY required for exchange-identified closing prices")
        time.sleep(self.interval)
        response = self.session.get("https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd",
                                    params={"basDd": day}, headers={"AUTH_KEY": key}, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise KrxPriceSchemaMismatch("KRX Open API payload is not an object")
        rows = payload.get("OutBlock_1")
        fields = {"BAS_DD", "ISU_CD", "ISU_NM", "TDD_CLSPRC", "ACC_TRDVAL", "ACC_TRDVOL", "MKTCAP", "LIST_SHRS"}
        if not isinstance(rows, list):
            raise KrxPriceSchemaMismatch("KRX Open API missing observation list")
        if not rows:
            raise KrxPriceNotPublished("KRX Open API observation list is empty")
        if any(not isinstance(r, dict) or not fields.issubset(r) or r["BAS_DD"] != day for r in rows):
            raise KrxPriceSchemaMismatch("KRX Open API schema/date mismatch")
        return rows

    def pykrx_prices(self, day):
        # Probe only. Production prices use the exchange-identified official API.
        frame = self.call(self.stock.get_market_ohlcv_by_ticker, day, market="KOSPI")
        records(frame, ["종가", "거래대금"])
        return {"rows": len(frame), "columns": list(frame.columns)}

    def official_index(self, day):
        key = os.environ.get("KRX_API_KEY")
        if not key:
            raise RuntimeError("KRX_API_KEY required")
        response = self.session.get("https://data-dbg.krx.co.kr/svc/apis/idx/kospi_dd_trd",
                                    params={"basDd": day}, headers={"AUTH_KEY": key}, timeout=30)
        response.raise_for_status()
        rows = response.json().get("OutBlock_1")
        if not isinstance(rows, list):
            raise ValueError("Index Open API schema mismatch")
        found = [r for r in rows if str(r.get("IDX_NM", "")).replace(" ", "") == "코스피200" and r.get("BAS_DD") == day]
        if len(found) != 1 or number(found[0].get("CLSPRC_IDX")) is None:
            raise ValueError("Index Open API date/field mismatch")
        return found


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
