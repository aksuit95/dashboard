"""Pure transforms. Ratios are percentage points (0..100); money is KRW."""
from __future__ import annotations

import hashlib
import json
from datetime import date, timedelta

from .sources import number

VERSION = "short-selling.krx-close.v1"
PRICE = {"exchange": "KRX", "session": "regular", "price_time": "15:30:00", "timezone": "Asia/Seoul", "adjusted": False}
WARNINGS = [
    "공매도 거래비중은 플로우, 순보유잔고는 스톡이며 서로 다른 지표입니다.",
    "순보유잔고는 공시 기준 초과 보유자만 집계되어 종목 전체 숏 합계가 아닙니다.",
    "대차잔고는 공매도 선행지표일 뿐 실제 공매도 포지션과 같지 않습니다.",
    "숏커버링 표시는 설정 조건에 따른 보조 지표이며 실제 상환을 확인한 매매 신호가 아닙니다.",
]
FIELDS = ("close", "market_cap", "listed_shares", "volume", "trading_value", "short_volume", "short_value",
          "short_volume_ratio_pct", "short_value_ratio_pct", "balance_quantity", "balance_value", "balance_ratio_pct",
          "lending_quantity", "lending_change", "return_pct")


def ratio(a, b):
    return None if a is None or b is None or b <= 0 else a / b * 100


def strict_mean(rows, field, n):
    window = rows[-n:]
    if len(window) != n or any(r.get(field) is None for r in window):
        return None
    return sum(r[field] for r in window) / n


def change(a, b):
    return None if a is None or b is None else a - b


def indexed(rows, key):
    result = {}
    for row in rows:
        code = row[key]
        if code in result:
            raise ValueError("Duplicate source ticker")
        result[code] = row
    return result


def normalize(day, raw, lending=None):
    prices = indexed(raw["prices"], "ISU_CD")
    shorts = indexed(raw["short"], "ISU_CD")
    balances = indexed(raw["balance"], "ISU_CD") if raw["balance"] is not None else {}
    output = {}
    # Source rows, rather than hard-coded ticker count, define historical membership.
    for code in raw["members"]:
        p, s, b = prices.get(code), shorts.get(code), balances.get(code)
        row = dict.fromkeys(FIELDS)
        row.update(date=day, session_status="trading", balance_status="not_disclosed" if b is None else "reported",
                   lending_status="unavailable", name=p.get("ISU_NM") if p else (s.get("ISU_ABBRV") if s else code))
        if p:
            for target, source in [("close", "TDD_CLSPRC"), ("market_cap", "MKTCAP"), ("listed_shares", "LIST_SHRS")]:
                row[target] = number(p[source])
            if row["close"] is not None and row["close"] <= 0:
                row["close"] = None
        if s:
            for target, source in [("short_volume", "CVSRTSELL_TRDVOL"), ("short_value", "CVSRTSELL_TRDVAL"), ("volume", "ACC_TRDVOL"), ("trading_value", "ACC_TRDVAL")]:
                row[target] = number(s[source])
            row["short_volume_ratio_pct"] = ratio(row["short_volume"], row["volume"])
            row["short_value_ratio_pct"] = ratio(row["short_value"], row["trading_value"])
        if b:
            for target, source in [("balance_quantity", "BAL_QTY"), ("balance_value", "BAL_AMT"), ("balance_ratio_pct", "BAL_RTO")]:
                row[target] = number(b[source])
        elif raw["balance"] is None:
            row["balance_status"] = "publication_pending"
        loan = (lending or {}).get((day, code))
        row["lending_published_at"] = None
        if loan:
            row.update(lending_quantity=loan["quantity"], lending_status="reported", lending_published_at=loan["published_at"])
        for field in FIELDS:
            if field != "return_pct" and row[field] is not None and row[field] < 0:
                raise ValueError("Negative source metric: " + field)
        for field in ["short_volume_ratio_pct", "short_value_ratio_pct", "balance_ratio_pct"]:
            if row[field] is not None and row[field] > 100:
                raise ValueError("Invalid percentage: " + field)
        output[code] = row
    if not any(r["close"] is not None for r in output.values()):
        raise ValueError("No KRX closes for constituents")
    return output


def aggregate(day, members, rows, index_close):
    valid = [rows[c] for c in members if c in rows and all(rows[c].get(f) is not None for f in ("short_value", "trading_value", "short_volume", "volume"))]
    full = len(valid) == len(members)
    def total(field):
        return sum(r[field] for r in valid) if full else None
    value, trading = total("short_value"), total("trading_value")
    volume, all_volume = total("short_volume"), total("volume")
    return {"date": day, "session_status": "trading", "index_close": index_close,
            "short_value": value, "trading_value": trading, "short_volume": volume, "volume": all_volume,
            "short_value_ratio_pct": ratio(value, trading), "short_volume_ratio_pct": ratio(volume, all_volume),
            "expected_count": len(members), "observed_count": len(valid), "coverage": "complete" if full else "incomplete"}


def derive(rows, config):
    """Averages and peaks use preceding sessions, excluding the current session."""
    current, previous = rows[-1], rows[:-1]
    result = {}
    for field in ("short_value_ratio_pct", "short_value", "short_volume_ratio_pct"):
        for n in (5, 20):
            avg = strict_mean(previous, field, n)
            result[f"{field}_mean_{n}"] = avg
            result[f"{field}_vs_mean_{n}_pct"] = change(ratio(current.get(field), avg), 100)
        result[f"{field}_change_1d"] = change(current.get(field), previous[-1].get(field) if previous else None)
    avg = result["short_value_ratio_pct_mean_20"]
    result["surge"] = None if avg is None or avg <= 0 or current["short_value_ratio_pct"] is None else current["short_value_ratio_pct"] >= avg * config["surge_multiple"]
    n = config["cover_lookback_sessions"]
    window = rows[-(n + 1):-1]
    valid = len(window) == n and all(r["short_value_ratio_pct"] is not None and r["close"] is not None for r in window)
    peak = max((r["short_value_ratio_pct"] for r in window), default=None) if valid else None
    drop = change(100, ratio(current["short_value_ratio_pct"], peak))
    rise = change(ratio(current.get("close"), window[0].get("close") if valid else None), 100)
    result.update(cover_peak_ratio_pct=peak, cover_drop_pct=drop, cover_price_rise_pct=rise,
                  short_cover_signal=None if drop is None or rise is None else drop >= config["cover_drop_from_peak_pct"] and rise >= config["cover_price_rise_pct"])
    return result


def build(snapshots, index, start, end, config, collected_at, sample=False, universe="kospi200"):
    histories, market, memberships = {}, [], []
    all_codes = sorted({c for raw in snapshots.values() for c in raw["members"]})
    for day in sorted(snapshots):
        rows = snapshots[day]["normalized"]
        members = snapshots[day]["members"]
        memberships.append({"date": day, "codes": members})
        for code, row in rows.items():
            histories.setdefault(code, {})[day] = row
        market.append(aggregate(day, members, rows, index.get(day)))
    days = []
    day = date.fromisoformat(start)
    while day.isoformat() <= end:
        days.append(day.isoformat())
        day += timedelta(days=1)
    market_by_day = {r["date"]: r for r in market}
    market_rows = [market_by_day.get(d, {"date": d, "session_status": "no_observation", "index_close": None, "short_value": None, "trading_value": None, "short_volume": None, "volume": None, "short_value_ratio_pct": None, "short_volume_ratio_pct": None, "expected_count": None, "observed_count": None, "coverage": "unavailable"}) for d in days]
    fingerprint = hashlib.sha256(json.dumps([snapshots, index, config, sample, universe, "lending-listed-shares-v2"], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
    meta = {"schema_version": VERSION, "dataset_id": fingerprint, "as_of": end, "collected_at": collected_at,
            "price_basis": PRICE, "is_sample": sample, "period_start": start,
            "flow_scope": "KRX short-selling statistics; ratios use denominators from the same source response; venue scope not independently verified",
            "universe": universe, "membership_basis": "point_in_time", "units": {"money": "KRW", "quantity": "shares", "ratio": "percent_0_100"}}
    latest_codes = snapshots[end]["members"]
    files, stocks = {}, []
    for code in all_codes:
        history = []
        previous = None
        for d in days:
            found = histories.get(code, {}).get(d)
            row = dict(found) if found else {**dict.fromkeys(FIELDS), "date": d, "session_status": "no_observation", "balance_status": "unavailable", "lending_status": "unavailable", "lending_published_at": None}
            if found:
                row["return_pct"] = change(ratio(row["close"], previous["close"] if previous else None), 100)
                row["lending_change"] = change(row["lending_quantity"], previous["lending_quantity"] if previous else None)
                row["lending_change_shares_pct"] = ratio(row["lending_change"], row.get("listed_shares"))
            # Missing trading session or absence from index must break comparisons.
            if d in snapshots:
                previous = row
            history.append(row)
        files[f"history/{code}.json"] = {**meta, "code": code, "rows": history}
        if code not in latest_codes:
            continue
        sessions = [r for r in history if r["date"] in snapshots]
        current = dict(sessions[-1])
        current.update(derive(sessions, config))
        current.update(code=code, sector=None, sector_presets=[name for name, codes in config["sector_presets"].items() if code in codes])
        disclosed = [r for r in sessions if r["balance_ratio_pct"] is not None]
        current["latest_disclosed_balance"] = ({"as_of": disclosed[-1]["date"], **{k: disclosed[-1][k] for k in ("balance_quantity", "balance_value", "balance_ratio_pct")}} if disclosed else None)
        loans = [r for r in sessions if r.get("lending_quantity") is not None]
        current["latest_lending"] = ({"as_of": loans[-1]["date"], "quantity": loans[-1]["lending_quantity"], "quantity_shares_pct": ratio(loans[-1]["lending_quantity"], loans[-1].get("listed_shares")), "change": loans[-1]["lending_change"], "change_shares_pct": loans[-1].get("lending_change_shares_pct"), "source": loans[-1].get("lending_source"), "updated_at": loans[-1].get("lending_updated_at"), "collected_at": loans[-1].get("lending_collected_at")} if loans else None)
        stocks.append(current)
    def rank(field, positive=False):
        return [{"code": s["code"], "name": s.get("name"), "value": s[field], "as_of": end} for s in sorted((s for s in stocks if s.get(field) is not None and (not positive or s[field] > 0)), key=lambda s: s[field], reverse=True)[:10]]
    balances = [{"code": s["code"], "name": s.get("name"), "value": s["latest_disclosed_balance"]["balance_ratio_pct"], "as_of": s["latest_disclosed_balance"]["as_of"]} for s in stocks if s.get("latest_disclosed_balance")]
    lending_ranks = [{"code": s["code"], "name": s.get("name"), "value": s["latest_lending"]["change_shares_pct"], "as_of": s["latest_lending"]["as_of"]} for s in stocks if s.get("latest_lending") and s["latest_lending"].get("change_shares_pct") is not None and s["latest_lending"]["change_shares_pct"] > 0]
    rankings = {"short_ratio": rank("short_value_ratio_pct"), "surge": rank("short_value_ratio_pct_vs_mean_20_pct", positive=True),
                "balance_ratio": sorted(balances, key=lambda r: r["value"], reverse=True)[:10], "lending_increase": sorted(lending_ranks, key=lambda r: r["value"], reverse=True)[:10]}
    latest = market[-1]
    trading_rows = [r for r in market_rows if r["session_status"] == "trading"]
    mean20 = strict_mean(trading_rows[:-1], "short_value", 20)
    files.update({"market_history.json": {**meta, "rows": market_rows},
                  "constituents.json": {**meta, "rows": memberships},
                  "stocks.json": {**meta, "config": config, "stocks": stocks},
                  "summary.json": {**meta, "market": latest, "short_value_change_1d_pct": change(ratio(latest["short_value"], market[-2]["short_value"] if len(market) > 1 else None), 100),
                                   "short_value_mean_20": mean20, "short_value_vs_mean_20_pct": change(ratio(latest["short_value"], mean20), 100),
                                   "short_ratio_change_1d_pp": change(latest["short_value_ratio_pct"], market[-2]["short_value_ratio_pct"] if len(market) > 1 else None),
                                   "short_ratio_mean_20": strict_mean(trading_rows[:-1], "short_value_ratio_pct", 20),
                                   "short_ratio_vs_mean_20_pp": change(latest["short_value_ratio_pct"], strict_mean(trading_rows[:-1], "short_value_ratio_pct", 20)),
                                   "rankings": rankings, "warnings": WARNINGS, "config": config}})
    return files
