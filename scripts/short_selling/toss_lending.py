"""Update saved short-selling snapshots with Toss securities-lending records."""
import json
import argparse
import os
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import date, datetime
from pathlib import Path

from .collect import log, publish, read_previous
from .model import build
from .sources import KST, ROOT, load_env

ORIGIN = "https://openapi.tossinvest.com"


def parse_records(payload, code, start, end):
    result = payload.get("result")
    if not isinstance(result, dict) or not isinstance(result.get("records"), list):
        raise ValueError("Invalid Toss lending response")
    output = {}
    for record in result["records"]:
        day = date.fromisoformat(record["date"]).isoformat()
        updated = datetime.fromisoformat(record["updatedAt"].replace("Z", "+00:00"))
        quantity = record["balanceQuantity"]
        if updated.tzinfo is None or isinstance(quantity, bool) or not str(quantity).isdigit():
            raise ValueError("Invalid Toss lending record")
        if start <= day <= end:
            if (day, code) in output:
                raise ValueError("Duplicate Toss lending record")
            output[day, code] = {"quantity": int(quantity), "updated_at": updated.isoformat()}
    return output


def request_json(url, data=None, token=None):
    headers = {"Authorization": "Bearer " + token} if token else {}
    request = urllib.request.Request(url, data=data, headers=headers)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500 or attempt == 3:
                raise
            time.sleep(min(30, float(exc.headers.get("Retry-After", 2 ** attempt))))


def fetch_all(codes, start, end):
    client = os.getenv("TOSS_CLIENT_ID") or os.getenv("toss_API_KEY")
    secret = os.getenv("TOSS_CLIENT_SECRET") or os.getenv("toss_API_SECRET")
    if not client or not secret:
        raise ValueError("Toss credentials missing")
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": client, "client_secret": secret}).encode()
    token = request_json(ORIGIN + "/oauth2/token", data=body)["access_token"]
    output = {}
    for i, code in enumerate(codes):
        cursor = end
        seen = set()
        while cursor:
            if cursor in seen:
                raise ValueError("Repeated Toss pagination cursor")
            seen.add(cursor)
            time.sleep(0.15)
            query = urllib.parse.urlencode({"count": 100, "until": cursor})
            try:
                payload = request_json(f"{ORIGIN}/api/v1/stocks/{code}/securities-lending?{query}", token=token)
            except urllib.error.HTTPError as exc:
                log("toss_lending_http_error", code=code, status=exc.code)
                if exc.code == 404:
                    break
                raise
            records = parse_records(payload, code, start, end)
            if output.keys() & records.keys():
                raise ValueError("Overlapping Toss pages")
            output.update(records)
            raw = payload["result"]["records"]
            next_cursor = payload["result"].get("nextUntil")
            if not raw or not next_cursor or min(r["date"] for r in raw) <= start:
                break
            date.fromisoformat(next_cursor)
            if next_cursor >= cursor:
                raise ValueError("Invalid Toss pagination cursor")
            cursor = next_cursor
        if (i + 1) % 25 == 0:
            log("toss_lending_progress", completed=i + 1, total=len(codes))
    return output


def update(target=ROOT / "data"):
    summary = json.loads((target / "summary.json").read_text(encoding="utf-8"))
    config = summary["config"]
    snapshots, index = read_previous(target)
    if not snapshots:
        raise ValueError("No saved short-selling data")
    codes = sorted({code for snapshot in snapshots.values() for code in snapshot["normalized"]})
    start, end = summary["period_start"], summary["as_of"]
    observations = fetch_all(codes, start, end)
    if not observations:
        raise ValueError("No Toss lending records")
    collected = datetime.now(KST).isoformat()
    for day, snapshot in snapshots.items():
        for code, row in snapshot["normalized"].items():
            loan = observations.get((day, code))
            if loan:
                row.update(lending_quantity=loan["quantity"], lending_status="reported", lending_published_at=None,
                           lending_source="토스증권", lending_updated_at=loan["updated_at"], lending_collected_at=collected)
    files = build(snapshots, index, start, end, config, summary["collected_at"])
    publish(files, target)
    log("toss_lending_published", records=len(observations), codes=len(codes), collected_at=collected)


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--output", type=Path, default=ROOT / "data")
        args = parser.parse_args()
        load_env()
        update(args.output)
    except Exception as exc:
        log("toss_lending_failed_previous_json_preserved", error_type=type(exc).__name__)
        raise SystemExit(1)
