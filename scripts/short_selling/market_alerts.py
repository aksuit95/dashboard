"""Collect a timestamped Naver market-alert snapshot; no stock prices are used."""
import argparse
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
URL = "https://stock.naver.com/api/domestic/market/stock/default"
LABELS = {"01": "투자주의", "02": "투자경고", "03": "투자위험"}


def fetch(session):
    alerts = {}
    queries = [("marketAlertType", kind, label) for kind, label in LABELS.items()]
    queries += [("statusTag", None, "관리"), ("tradeStopYn", None, "거래정지")]
    for order, kind, label in queries:
        seen = set()
        for page in range(100):
            time.sleep(0.3)
            params = {"tradeType": "KRX", "marketType": "ALL", "orderType": order, "startIdx": page, "pageSize": 100}
            if kind is not None:
                params["alertType"] = kind
            response = session.get(URL, params=params, timeout=25, headers={"User-Agent": "Mozilla/5.0"})
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list) or len(rows) > 100:
                raise ValueError("Unexpected market-alert response")
            for row in rows:
                code = row.get("itemcode") if isinstance(row, dict) else None
                if not isinstance(code, str) or not re.fullmatch(r"[0-9A-Z]{6}", code) or code in seen:
                    raise ValueError("Invalid or duplicate alert row")
                if order == "marketAlertType" and row.get("marketAlertType") != kind:
                    raise ValueError("Market alert filter mismatch")
                if order == "statusTag" and row.get("manageStatusGb") not in ("1", "3"):
                    raise ValueError("Management filter mismatch")
                if order == "tradeStopYn" and row.get("tradeStopYn") != "Y":
                    raise ValueError("Trading halt filter mismatch")
                seen.add(code)
                alerts.setdefault(code, []).append(label)
            if len(rows) < 100:
                break
        else:
            raise ValueError("Incomplete market-alert pagination")
    return {"schema_version": "market-alerts.v2", "source": "네이버페이 증권 관리·거래정지·시장경보 목록", "source_url": "https://stock.naver.com/market/stock/kr/management/investmentAlert", "observed_at": datetime.now(timezone(timedelta(hours=9))).isoformat(), "alerts": alerts}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT / "data/market_alerts.json"))
    args = parser.parse_args()
    try:
        snapshot = fetch(requests.Session())
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent, delete=False) as handle:
            temp = Path(handle.name)
            json.dump(snapshot, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        try:
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)
        print(json.dumps({"event": "market_alerts_published", "observed_at": snapshot["observed_at"], "count": len(snapshot["alerts"])}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"event": "market_alerts_failed_previous_preserved", "error_type": type(exc).__name__}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
