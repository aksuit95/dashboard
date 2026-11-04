"""Run isolated, bounded live source probes; output contains no credentials/bodies."""
import argparse
import contextlib
import io
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

from .sources import KST, Source, completed_day, load_env

ITEMS = ("members", "short", "balance", "prices", "pykrx_prices", "index", "official_index")


def one(item, day):
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            source = Source(0)
            if item == "index":
                start = (datetime.strptime(day, "%Y%m%d") - timedelta(days=14)).strftime("%Y%m%d")
                result = source.index(start, day)
            else:
                result = getattr(source, item)(day)
        sample = result[:2] if isinstance(result, list) else result
        return {"item": item, "status": "ok", "rows": len(result) if isinstance(result, list) else result["rows"], "sample": sample}
    except Exception as exc:
        return {"item": item, "status": "failed", "error_type": type(exc).__name__,
                "message": "Source access/schema check failed; production JSON was not modified."}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="YYYYMMDD; defaults to latest completed KRX session")
    parser.add_argument("--output", default="docs/short-selling-probe.json")
    parser.add_argument("--one", choices=ITEMS)
    args = parser.parse_args()
    day = args.date or completed_day().strftime("%Y%m%d")
    if args.one:
        print(json.dumps(one(args.one, day), ensure_ascii=False))
        return
    load_env()
    def run(item):
        try:
            result = subprocess.run([sys.executable, "-m", "scripts.short_selling.probe", "--date", day, "--one", item],
                                    capture_output=True, text=True, encoding="utf-8", timeout=100,
                                    env={**os.environ, "PYTHONIOENCODING": "utf-8"})
            return json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            return {"item": item, "status": "failed", "error_type": "Timeout", "timeout_seconds": 100}
        except Exception as exc:
            return {"item": item, "status": "failed", "error_type": type(exc).__name__}
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(run, ITEMS))
    results.append({"item": "seibro_lending", "status": "unsupported", "message": "No verified automated endpoint/schema. Keep null; use SEIBro export import adapter."})
    report = {"checked_at": datetime.now(KST).isoformat(), "requested_date": day,
              "production_data_modified": False, "results": results,
              "market_aggregate": "Requires validated constituent membership + short-flow denominators on each historical session; not KOSPI-wide proxy."}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": args.output, "results": [{"item": r["item"], "status": r["status"], "error_type": r.get("error_type")} for r in results]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
