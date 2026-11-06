"""python -m scripts.short_selling.collect [--sample | --backfill]"""
from __future__ import annotations

import argparse
import contextlib
import csv
import io
import json
import os
import shutil
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

from .model import PRICE, VERSION, build, normalize
from .sources import KST, ROOT, Source, completed_day, known_calendar, number


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def log(event, **fields):
    record = {"at": datetime.now(KST).isoformat(), "event": event, **fields}
    print(json.dumps(record, ensure_ascii=False), flush=True)
    path = ROOT / "logs/short-selling/collector.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def validate(files):
    from jsonschema import Draft202012Validator, FormatChecker
    schema = json.loads((ROOT / "schemas/short-selling.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    ids = set()
    for name, payload in files.items():
        json.dumps(payload, allow_nan=False)
        validator.validate(payload)
        ids.add(payload["dataset_id"])
    if len(ids) != 1:
        raise ValueError("Mixed dataset generations")


def publish(files, target):
    """Validate all files before replacement; rollback local write errors.

    Git commit/deploy is the public transaction boundary. Frontend must compare
    dataset_id across fetches to detect an update while browsing.
    """
    validate(files)
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="shorting-stage-", dir=target.parent) as temp:
        stage = Path(temp)
        for name, payload in files.items():
            dump(stage / "new" / name, payload)
        replaced = []
        try:
            for name in files:
                path = target / name
                backup = stage / "old" / name
                if path.exists():
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(path, backup)
                path.parent.mkdir(parents=True, exist_ok=True)
                os.replace(stage / "new" / name, path)
                replaced.append(name)
        except BaseException:
            for name in reversed(replaced):
                path, backup = target / name, stage / "old" / name
                if backup.exists():
                    os.replace(backup, path)
                else:
                    path.unlink(missing_ok=True)
            raise


def read_previous(target):
    if not (target / "summary.json").exists():
        return {}, {}
    summary = json.loads((target / "summary.json").read_text(encoding="utf-8"))
    if summary.get("schema_version") != VERSION or summary.get("price_basis") != PRICE or summary.get("is_sample"):
        raise ValueError("Incompatible cache; explicit backfill required")
    ident = summary["dataset_id"]
    def read(name):
        data = json.loads((target / name).read_text(encoding="utf-8"))
        if data.get("dataset_id") != ident:
            raise ValueError("Incomplete prior generation")
        return data
    members = read("constituents.json")["rows"]
    histories = {c: {r["date"]: r for r in read(f"history/{c}.json")["rows"]} for c in {c for m in members for c in m["codes"]}}
    snapshots = {m["date"]: {"members": m["codes"], "normalized": {c: rows[m["date"]] for c, rows in histories.items() if rows[m["date"]]["session_status"] == "trading"}} for m in members}
    index = {r["date"]: r["index_close"] for r in read("market_history.json")["rows"] if r["session_status"] == "trading"}
    return snapshots, index


def read_lending(path):
    """Optional verified SEIBro export, normalized by the operator (no guessed API)."""
    if not path:
        return {}
    output = {}
    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            day, code = row["date"], row["code"]
            date.fromisoformat(day)
            import re
            if not re.fullmatch(r"[0-9A-Z]{6}", code) or row["source"] != "SEIBro":
                raise ValueError("Invalid SEIBro export provenance")
            published = datetime.fromisoformat(row["published_at"])
            if published.tzinfo is None:
                raise ValueError("SEIBro publication timestamp needs timezone")
            quantity = number(row["quantity"])
            if quantity is None or quantity < 0 or int(quantity) != quantity:
                raise ValueError("Invalid lending quantity")
            if (day, code) in output:
                raise ValueError("Duplicate lending date/ticker")
            output[day, code] = {"quantity": quantity, "published_at": row["published_at"]}
    return output


def check_config(config):
    for key in ("surge_multiple", "cover_lookback_sessions", "cover_drop_from_peak_pct", "cover_price_rise_pct", "refresh_sessions", "request_interval_seconds"):
        value = config[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
            raise ValueError("Invalid config: " + key)
    if config["cover_drop_from_peak_pct"] > 100:
        raise ValueError("Invalid drop threshold")
    for key in ("refresh_sessions", "cover_lookback_sessions"):
        if int(config[key]) != config[key]:
            raise ValueError("Session window must be integer")


def collect(args, config):
    end = completed_day()
    if args.as_of:
        requested = date.fromisoformat(args.as_of)
        if requested > end:
            raise ValueError("Requested session is not completed")
        end = requested
    # A fixed KRX 15:30 contract deliberately blocks unverified special sessions.
    year, holidays, uncertain = known_calendar()
    # 2025 CSAT: KRX equity session closed at 16:30, outside the fixed
    # 15:30 contract. Preserve the session, but not its close as a 15:30 price.
    uncertain = uncertain | {"2025-11-13"}
    if end.year != year or end.weekday() >= 5 or end.isoformat() in holidays | uncertain:
        raise ValueError("Requested date is not a verified regular KRX session")
    start = end - timedelta(days=365)
    target = Path(args.output)
    old, _ = ({}, {}) if args.backfill else read_previous(target)
    source = Source(config["request_interval_seconds"])
    log("fetch_index", start=start.isoformat(), end=end.isoformat())
    index_rows = source.index(start.strftime("%Y%m%d"), end.strftime("%Y%m%d"))
    index = {}
    for row in index_rows:
        day = date.fromisoformat(str(row["TRD_DD"]).replace("/", "-")).isoformat()
        if day in index or not start.isoformat() <= day <= end.isoformat():
            raise ValueError("Index dates duplicated/out of range")
        value = number(row["CLSPRC_IDX"])
        if value is None or value <= 0:
            raise ValueError("Missing KRX index close")
        index[day] = value
    if not index or max(index) != end.isoformat():
        raise ValueError("Latest completed session index not published; keep previous JSON")
    # Detect missing index dates against the reviewed calendar for its covered year.
    d = start
    while d <= end:
        if d.year == year and d.weekday() < 5 and d.isoformat() not in holidays:
            if d.isoformat() not in uncertain and d.isoformat() not in index:
                raise ValueError("Index missing a verified KRX session: " + d.isoformat())
        d += timedelta(days=1)
    dates = sorted(index)
    latest_members = source.members(end.strftime("%Y%m%d"))
    refresh = set(dates[-config["refresh_sessions"]:])
    lending = read_lending(args.lending_csv)
    snapshots = {}
    cache = ROOT / ".shorting-cache" / VERSION
    for day in dates:
        if day in old and day not in refresh and set(latest_members).issubset(old[day]["normalized"]):
            snapshots[day] = old[day]
            continue
        path = cache / f"{day}.json"
        cached = json.loads(path.read_text(encoding="utf-8")) if path.exists() and day not in refresh and not args.backfill else None
        if cached:
            raw = cached
        else:
            compact = day.replace("-", "")
            log("collect_session", date=day)
            try:
                raw = {"members": source.members(compact), "short": source.short(compact), "prices": source.prices(compact), "balance": source.balance(compact)}
            except Exception as exc:
                # API failure, including balance failures, aborts the entire dataset.
                log("source_failed", date=day, error_type=type(exc).__name__)
                raise
            dump(path, raw)
        # Latest constituents get a full stock history before index inclusion too.
        # Market totals below still use only each session's actual constituents.
        normalized = normalize(day, {**raw, "members": sorted(set(raw["members"]) | set(latest_members))}, lending)
        # Refreshing KRX data must not erase independently collected lending data.
        for code, row in normalized.items():
            prior = old.get(day, {}).get("normalized", {}).get(code, {})
            if row["lending_quantity"] is None and prior.get("lending_quantity") is not None:
                for key in ("lending_quantity", "lending_status", "lending_published_at", "lending_source", "lending_updated_at", "lending_collected_at"):
                    if key in prior:
                        row[key] = prior[key]
        if not raw["balance"] and day in dates[-3:]:
            for row in normalized.values():
                row["balance_status"] = "publication_pending"
        if day in uncertain:
            # Keep the session position so return / mean windows cannot jump it.
            # Neither index nor stock prices may be labeled 15:30 on unverified days.
            index[day] = None
            for row in normalized.values():
                row["close"] = None
                row["market_cap"] = None
        snapshots[day] = {"members": raw["members"], "normalized": normalized}
    # Apply operator-provided SEIBro observations even to reused historical rows.
    for day, snapshot in snapshots.items():
        for code, row in snapshot["normalized"].items():
            loan = lending.get((day, code))
            if loan:
                row.update(lending_quantity=loan["quantity"], lending_published_at=loan["published_at"], lending_status="reported")
    files = build(snapshots, index, start.isoformat(), end.isoformat(), config, datetime.now(KST).isoformat())
    publish(files, target)
    log("published", as_of=end.isoformat(), files=len(files), output=str(target))


def sample(config, output):
    # Deliberately synthetic, two stocks / 35 weekdays, stored outside data/.
    days = [date(2026, 9, 1) + timedelta(days=i) for i in range(50)]
    days = [d.isoformat() for d in days if d.weekday() < 5][:35]
    snapshots, index = {}, {}
    for i, day in enumerate(days):
        codes = ["005930", "035420"]
        rows = {}
        for j, code in enumerate(codes):
            from .model import FIELDS
            r = dict.fromkeys(FIELDS)
            total = 100_000_000_000 * (j + 1)
            pct = 4 + j + i % 4 if i < 34 else 18 + j
            r.update(date=day, name=["삼성전자 (합성 샘플)", "NAVER (합성 샘플)"][j], session_status="trading",
                     close=60_000 + i * 100 + j * 100_000, market_cap=400_000_000_000_000,
                     listed_shares=5_000_000_000, trading_value=total, volume=1_000_000,
                     short_value=total * pct / 100, short_volume=pct * 10_000,
                     short_value_ratio_pct=pct, short_volume_ratio_pct=pct,
                     balance_quantity=None if i > 31 else 10_000_000, balance_value=None if i > 31 else 600_000_000_000,
                     balance_ratio_pct=None if i > 31 else 0.2, balance_status="publication_pending" if i > 31 else "reported",
                     lending_status="unavailable", lending_published_at=None)
            rows[code] = r
        snapshots[day] = {"members": codes, "normalized": rows}
        index[day] = 300 + i
    files = build(snapshots, index, days[0], days[-1], config, datetime.now(KST).isoformat(), sample=True)
    publish(files, Path(output))
    log("synthetic_sample_written", output=output, files=len(files), is_sample=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--backfill", action="store_true")
    parser.add_argument("--as-of", help="Completed regular session, YYYY-MM-DD")
    parser.add_argument("--output", default=None)
    parser.add_argument("--config", default=str(ROOT / "config/short-selling.json"))
    parser.add_argument("--lending-csv")
    args = parser.parse_args()
    args.output = args.output or str(ROOT / ("examples/short-selling" if args.sample else "data"))
    # A synthetic example must never replace production JSON, even accidentally.
    if args.sample and Path(args.output).resolve().is_relative_to((ROOT / "data").resolve()):
        parser.error("Synthetic samples must be outside data/")
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    try:
        check_config(config)
        with contextlib.redirect_stderr(io.StringIO()):
            if args.sample:
                sample(config, args.output)
            else:
                collect(args, config)
    except Exception as exc:
        # Never record raw exceptions (HTTP response bodies can contain credentials).
        log("failed_previous_json_preserved", error_type=type(exc).__name__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
