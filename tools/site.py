"""Assemble versioned product Markdown and build the static documentation portal."""
import argparse
import hashlib
import html
import json
import os
import posixpath
import re
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from check_links import LINK, check, prose

ROOT = Path(__file__).resolve().parents[1]
ENTRY = re.compile(r"^(\s*)- \[([^\]]+)\]\(([^)]+)\)\s*$")
PIN = re.compile(r"^[0-9a-f]{40}$")


def git(path, *args):
    return subprocess.check_output(["git", "-C", str(path), *args], text=True).strip()


def revision(path, expected, locked):
    head = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "--verify", "HEAD"],
        text=True, capture_output=True
    )
    actual = head.stdout.strip() if head.returncode == 0 else "uncommitted"
    dirty = bool(git(path, "status", "--porcelain", "--untracked-files=normal"))
    if locked and (not isinstance(expected, str) or not PIN.fullmatch(expected) or expected != actual or dirty):
        raise ValueError(f"{path.name}: locked build requires a clean checkout at {expected}; got {actual}, dirty={dirty}")
    return {"revision": actual, "dirty": dirty}


def operation_sections(text):
    lines = text.splitlines(keepends=True)
    headings = [(n - 1, line[3:].strip()) for n, line in prose(text) if line.startswith("## ")]
    result = {}
    for index, (start, operation) in enumerate(headings):
        if operation in result:
            raise ValueError(f"Duplicate reference operation: {operation}")
        end = headings[index + 1][0] if index + 1 < len(headings) else len(lines)
        result[operation] = "#" + "".join(lines[start:end]).strip() + "\n"
    return result


def operation_pages(cube):
    catalog = json.loads((cube / "contracts/v1/catalog.json").read_text())
    operations = catalog["operations"]
    ids = [entry["operation"] for entry in operations]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate operation IDs in canonical catalog.")
    sections = operation_sections((cube / "docs/reference/operations.md").read_text())
    if set(ids) != set(sections):
        raise ValueError(f"Catalog/reference mismatch: {sorted(set(ids) ^ set(sections))}")
    return catalog, sections


def relative_link(destination, current):
    return posixpath.relpath(destination, posixpath.dirname(current) or ".")


def rewrite(text, source, destination, mapping, repositories, versions):
    repositories = {name: path.resolve() for name, path in repositories.items()}
    lines = text.splitlines(keepends=True)
    for number, _ in prose(text):
        def replace(match):
            raw = match[1].strip("<>")
            url = urlsplit(raw)
            github = re.fullmatch(r"/cubearc/(cube|play|recipes|docs)/blob/([^/]+)/(.+)", url.path)
            if url.netloc == "github.com" and github:
                name, reference, source_path = github.groups()
                target = (repositories[name] / unquote(source_path)).resolve()
                if target in mapping and reference in {"main", versions[name]["revision"]}:
                    resolved = relative_link(mapping[target], destination)
                    if url.fragment:
                        resolved += "#" + url.fragment
                    return match[0].replace(match[1], resolved)
            if url.scheme or url.netloc or raw.startswith("/"):
                return match[0]
            target = (source.parent / unquote(url.path)).resolve() if url.path else source
            if target in mapping:
                resolved = relative_link(mapping[target], destination)
                if url.fragment:
                    resolved += "#" + url.fragment
            else:
                resolved = None
                for name, repository in repositories.items():
                    if target.is_relative_to(repository):
                        path = target.relative_to(repository).as_posix()
                        resolved = f"https://github.com/cubearc/{name}/blob/{versions[name]['revision']}/{path}"
                        if url.fragment:
                            resolved += "#" + url.fragment
                        break
                if resolved is None:
                    raise ValueError(f"Link escapes documentation sources: {source}: {raw}")
            return match[0].replace(match[1], resolved)
        lines[number - 1] = LINK.sub(replace, lines[number - 1])
    return "".join(lines)


def assemble(sources_root, locked=False):
    pins = json.loads((ROOT / "sources.lock.json").read_text())["sources"]
    repositories = {name: (sources_root / name).resolve() for name in pins}
    repositories["docs"] = ROOT
    versions = {}
    for name, repository in repositories.items():
        if not repository.is_dir():
            raise ValueError(f"Missing checkout: {repository}")
        versions[name] = revision(repository, pins.get(name), locked and name != "docs")
    output = ROOT / "build/src"
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    if (ROOT / "assets").is_dir():
        shutil.copytree(ROOT / "assets", output / "assets")
    mapping = {}
    documents = []
    summary = ["# Summary", "", "[CubeArc](index.md)", "", "- [Documented versions](versions.md)"]
    for path in sorted((ROOT / "content").rglob("*.md")):
        destination = path.relative_to(ROOT / "content").as_posix()
        mapping[path.resolve()] = destination
        documents.append((path.resolve(), destination))
    catalog, operations = operation_pages(repositories["cube"])
    categories = {}
    for operation in catalog["operations"]:
        categories.setdefault(operation["category"], []).append(operation["operation"])
    for name in pins:
        repository = repositories[name]
        nav = repository / "docs/SUMMARY.md"
        for line in nav.read_text().splitlines():
            match = ENTRY.match(line)
            if not match:
                continue
            indent, title, target = match.groups()
            source = (nav.parent / target).resolve()
            if not source.is_relative_to(repository) or not source.is_file():
                raise ValueError(f"Invalid navigation entry: {nav}: {target}")
            relative = source.relative_to(repository).as_posix()
            destination = name + "/" + (relative[5:] if relative.startswith("docs/") else relative.lower())
            if name == "cube" and relative == "docs/reference/operations.md":
                destination = "cube/reference/operations/index.md"
                mapping[source] = destination
                summary.append(f"  {indent}- [{title}]({destination})")
                for category, ids in sorted(categories.items()):
                    category_page = f"cube/reference/operations/{category}/index.md"
                    summary.append(f"    {indent}- [{category}]({category_page})")
                    content = f"# {category} operations\n\n" + "\n".join(f"- [\x60{i}\x60]({i}.md)" for i in ids) + "\n"
                    write(output / category_page, content)
                    for operation_id in ids:
                        page = f"cube/reference/operations/{category}/{operation_id}.md"
                        summary.append(f"      {indent}- [{operation_id}]({page})")
                        content = rewrite(operations[operation_id], source, page, mapping, repositories, versions)
                        content += f"\n[Canonical schemas](../../../../catalog.json) · [Source contract](https://github.com/cubearc/cube/blob/{versions['cube']['revision']}/contracts/v1/catalog.json)\n"
                        write(output / page, content)
                continue
            mapping[source] = destination
            documents.append((source, destination))
            summary.append(f"  {indent}- [{title}]({destination})")
        # Indent only children: each product's first page is a top-level chapter.
        product_start = next(i for i, line in enumerate(summary) if line.endswith(f"]({name}/index.md)"))
        summary[product_start] = summary[product_start][2:]
    for source, destination in documents:
        text = rewrite(source.read_text(), source, destination, mapping, repositories, versions)
        name = next(name for name, repository in repositories.items() if source.is_relative_to(repository))
        version = versions[name]
        path = source.relative_to(repositories[name]).as_posix()
        preview = " · Unpublished local edits" if version["dirty"] else ""
        if PIN.fullmatch(version["revision"]):
            note = f"\n---\n\n[Edit source](https://github.com/cubearc/{name}/blob/{version['revision']}/{path}) · \x60{version['revision'][:12]}\x60{preview}\n"
        else:
            note = f"\n---\n\nLocal source: \x60{name}/{path}\x60 · Uncommitted preview\n"
        write(output / destination, text + note)
    summary += ["", "- [Contributing](contributing/index.md)", "  - [Documentation guide](contributing/documentation.md)", "  - [Page patterns](contributing/templates.md)", "  - [Site maintenance](contributing/site.md)"]
    write(output / "SUMMARY.md", "\n".join(summary))
    write(output / "cube/reference/operations/index.md", "# Operation reference\n\n"
          f"Generated from Cube {catalog['engine_version']} at \x60{versions['cube']['revision'][:12]}\x60. "
          "Choose a category or search for an operation ID. Schemas and examples describe the documented revision; inspect your installed build with \x60cube ops describe\x60.\n\n" +
          "\n".join(f"- [{category}]({category}/index.md): {len(ids)} operations" for category, ids in sorted(categories.items())))
    shutil.copyfile(repositories["cube"] / "contracts/v1/catalog.json", output / "catalog.json")
    shutil.copyfile(repositories["cube"] / "crates/cube-core/src/operations/contracts/conformance.json", output / "conformance.json")
    write(output / "versions.md", "# Documented versions\n\n"
          "These pages describe source checkouts, including source installation. A package version does not imply a published binary or package.\n\n"
          "| Repository | Commit | Local edits |\n| --- | --- | --- |\n" +
          "\n".join(f"| [{name}](https://github.com/cubearc/{name}/tree/{v['revision']}) | \x60{v['revision']}\x60 | {'yes — preview' if v['dirty'] else 'no'} |" for name, v in versions.items()))
    manifest = {"sources": versions, "operation_ids": sorted(operations), "catalog_sha256": hashlib.sha256((output / "catalog.json").read_bytes()).hexdigest()}
    write(output / "versions.json", json.dumps(manifest, indent=2))
    _, errors = check(output)
    if errors:
        raise ValueError("\n".join(errors))
    print(f"Assembled {len(documents)} authored pages and {len(operations)} exact operation references.")
    return output


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n")


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        if "id" in values:
            self.ids.add(values["id"])
        for key in ("href", "src"):
            if key in values:
                self.links.append(values[key])


def check_html(site):
    site = site.resolve()
    pages = {}
    for path in site.rglob("*.html"):
        parser = Page()
        parser.feed(path.read_text())
        pages[path.resolve()] = parser
    errors = []
    for path, page in pages.items():
        for link in page.links:
            url = urlsplit(html.unescape(link))
            if url.scheme or url.netloc:
                continue
            raw = unquote(url.path)
            if raw.startswith("/docs/"):
                target = (site / raw[len("/docs/"):]).resolve()
            elif raw.startswith("/"):
                continue
            else:
                target = (path.parent / raw).resolve() if raw else path
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                errors.append(f"{path.relative_to(site)}: missing {link}")
            elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
                errors.append(f"{path.relative_to(site)}: missing fragment {link}")
    if errors:
        raise ValueError("\n".join(errors[:100]) + f"\n{len(errors)} rendered link errors.")
    print(f"Verified links and fragments in {len(pages)} rendered pages.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["assemble", "build", "check-html"])
    parser.add_argument("--sources-root", type=Path, default=ROOT.parent)
    parser.add_argument("--locked", action="store_true")
    args = parser.parse_args()
    if args.command == "check-html":
        check_html(ROOT / "site")
        return
    assemble(args.sources_root.resolve(), args.locked)
    if args.command == "build":
        binary = ROOT / ".tools" / ("mdbook.exe" if os.name == "nt" else "mdbook")
        if not binary.is_file():
            raise SystemExit("Run python3 tools/install_mdbook.py first.")
        subprocess.run([str(binary), "build", str(ROOT)], check=True)
        check_html(ROOT / "site")


if __name__ == "__main__":
    main()
