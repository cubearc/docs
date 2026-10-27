"""Check local Markdown files and GitHub-style heading fragments without network I/O."""
import argparse
import html
import os
import re
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit

LINK = re.compile(r"!?\[[^\]\n]*\]\((<?[^)\s]+>?)(?:\s+\"[^\"]*\")?\)")
IGNORED = {".git", ".tools", "target", "node_modules", ".venv", "site", "build", "__pycache__"}


def prose(text):
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        marker = re.match(r"^\s*(\x60{3,}|~{3,})", line)
        if marker:
            kind = marker[1][0]
            if fence is None:
                fence = kind
            elif fence == kind:
                fence = None
            continue
        if fence is None:
            yield number, line


def slug(text):
    text = html.unescape(re.sub(r"<[^>]*>", "", text)).strip().lower()
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = "".join(c for c in text if c in " -_" or unicodedata.category(c)[0] in "LN")
    return text.replace(" ", "-")


def anchors(text):
    ids = set()
    counts = {}
    for _, line in prose(text):
        ids.update(re.findall(r'\bid=["\x27]([^"\x27]+)["\x27]', line))
        match = re.match(r"^#{1,6}\s+(.+?)(?:\s+#+)?$", line)
        if match:
            base = slug(match[1])
            count = counts.get(base, 0)
            ids.add(base if count == 0 else f"{base}-{count}")
            counts[base] = count + 1
    return ids


def check(root):
    root = Path(root).resolve()
    if not root.is_dir():
        raise ValueError(f"Markdown source directory does not exist: {root}")
    files = []
    for directory, directories, filenames in os.walk(root):
        directories[:] = sorted(name for name in directories if name not in IGNORED)
        files.extend(Path(directory) / name for name in sorted(filenames) if name.endswith(".md"))
    errors = []
    cached = {}
    for path in files:
        for number, line in prose(path.read_text()):
            for match in LINK.finditer(line):
                target = match[1].strip("<>")
                url = urlsplit(target)
                if url.scheme or url.netloc or target.startswith("/"):
                    continue
                destination = (path.parent / unquote(url.path)).resolve() if url.path else path
                if not destination.exists():
                    errors.append(f"{path.relative_to(root)}:{number}: missing {target}")
                    continue
                if url.fragment and destination.is_file() and destination.suffix == ".md":
                    if destination not in cached:
                        cached[destination] = anchors(destination.read_text())
                    if unquote(url.fragment) not in cached[destination]:
                        errors.append(f"{path.relative_to(root)}:{number}: missing fragment {target}")
    return files, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".")
    args = parser.parse_args()
    files, errors = check(args.root)
    for error in errors:
        print(error)
    print(f"Checked {len(files)} Markdown files; {len(errors)} broken local links.")
    raise SystemExit(bool(errors))


if __name__ == "__main__":
    main()
