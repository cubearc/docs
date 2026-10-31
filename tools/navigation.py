"""Explicit reader-facing presentation; canonical operation contracts stay in Cube."""

import json
from functools import lru_cache
from pathlib import Path


CATEGORIES = {
    "audio": "Audio",
    "binary": "Binary",
    "blockchain": "Offline key material",
    "ciphers": "Ciphers",
    "cryptanalysis": "Classical cryptanalysis",
    "encoding": "Encoding",
    "esolang": "Brainfuck",
    "file": "Files and archives",
    "graph": "Graphs",
    "hashing": "Hashes and checksums",
    "image": "Images",
    "investigation": "Investigations",
    "logic": "Boolean logic",
    "numbers": "Numbers and arithmetic",
    "pipelines": "Pipelines",
    "probability": "Probability",
    "recipes": "Recipes",
    "symbols": "Symbolic encodings",
    "text": "Text and Unicode",
    "video": "Video",
    "web": "Saved web content",
}


@lru_cache(maxsize=1)
def presentation_source():
    return json.loads(Path(__file__).with_name("tool-presentation.json").read_text())


def operation_title(operation):
    try:
        return presentation_source()["operations"][operation]["display_name"]
    except KeyError:
        raise ValueError(f"Add a reader-facing navigation title for {operation}") from None


def operation_aliases(operation):
    return presentation_source()["operations"][operation].get("aliases", [])


def category_title(category):
    if category not in CATEGORIES:
        raise ValueError(f"Add a reader-facing category title for {category}")
    return CATEGORIES[category]


def catalog_presentation(catalog):
    """Require exact editorial coverage of the supplied canonical catalog."""
    source = presentation_source()
    operations = {row["operation"]: row for row in catalog["operations"]}
    if len(operations) != len(catalog["operations"]) or source.get("format_version") != 1 or set(source["operations"]) != set(operations):
        raise ValueError("Presentation operation IDs must match the canonical catalog exactly")
    used = {}
    for operation, entry in source["operations"].items():
        tool_id = entry.get("tool_id")
        if tool_id not in source["tools"]:
            raise ValueError(f"Missing explicit tool presentation for {operation}")
        category = operations[operation]["category"]
        if tool_id in used and used[tool_id] != category:
            raise ValueError(f"Tool {tool_id} groups different categories")
        used[tool_id] = category
    if set(used) != set(source["tools"]):
        raise ValueError("Presentation contains tools without canonical operations")
    for entry in [*source["tools"].values(), *source["operations"].values()]:
        for field in ["display_name", "summary"]:
            if not isinstance(entry.get(field), str) or not entry[field].strip():
                raise ValueError(f"Presentation requires explicit {field}")
        for field in ["aliases", "legacy_tool_ids"]:
            values = entry.get(field, [])
            if not isinstance(values, list) or any(not isinstance(value, str) or not value for value in values):
                raise ValueError(f"Invalid presentation {field}")
    return {**source, "categories": {category: category_title(category) for category in sorted(set(used.values()))}}
