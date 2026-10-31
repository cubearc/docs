"""Reuse the documentation portal's canonical reader-facing names."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from navigation import catalog_presentation  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--catalog", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
catalog = json.loads(args.catalog.read_text())
result = catalog_presentation(catalog)
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
