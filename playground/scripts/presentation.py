"""Reuse the documentation portal's canonical reader-facing names."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from navigation import category_title, operation_title  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--catalog", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
catalog = json.loads(args.catalog.read_text())
result = {
    "operations": {item["operation"]: operation_title(item["operation"]) for item in catalog["operations"]},
    "categories": {item["category"]: category_title(item["category"]) for item in catalog["operations"]},
}
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
