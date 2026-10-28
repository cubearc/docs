"""Exercise data loss, broken-link and revision errors that must block publishing."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import check_links

spec = importlib.util.spec_from_file_location(
    "portal", Path(__file__).resolve().parents[1] / "tools/site.py"
)
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)


class LinkChecks(unittest.TestCase):
    def test_missing_source_directory_cannot_pass_a_check(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "does not exist"):
                check_links.check(Path(directory) / "missing")

    def test_heading_fragments_and_fences(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text(
                "# First\n\n[duplicate](other.md#same-1)\n"
                "[unicode](other.md#ação)\n[missing](other.md#code-only)\n"
                "\x60\x60\x60md\n[not a link](absent.md)\n\x60\x60\x60\n"
            )
            (root / "other.md").write_text(
                "# Same\n## Same\n## Ação\n"
                "\x60\x60\x60html\n<a id=\"code-only\"></a>\n\x60\x60\x60\n"
            )
            _, errors = check_links.check(root)
            self.assertEqual(len(errors), 1, errors)
            self.assertIn("code-only", errors[0])

    def test_parent_link_and_explicit_legacy_anchor(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text('<a id="legacy"></a>\n')
            (root / "docs").mkdir()
            (root / "docs/page.md").write_text("[old](../README.md#legacy)\n")
            self.assertEqual(check_links.check(root)[1], [])


class ReferenceChecks(unittest.TestCase):
    def test_reader_title_preserves_identifier_anchor_and_reference_content(self):
        content = '# encoding.base64.decode\n\nDecode exact bytes.\n\n```json\n{"inputs": {"input": "AA=="}}\n```\n'
        page = portal.present_operation("encoding.base64.decode", content)
        self.assertIn("# Decode Base64\n", page)
        self.assertIn('id="encodingbase64decode"', page)
        self.assertIn('<code>encoding.base64.decode</code>', page)
        self.assertTrue(page.endswith(content.partition("\n")[2].lstrip("\n")))

    def test_unknown_navigation_cannot_fall_back_to_a_machine_identifier(self):
        with self.assertRaisesRegex(ValueError, "reader-facing navigation title"):
            portal.operation_title("encoding.future.decode")
        with self.assertRaisesRegex(ValueError, "reader-facing category title"):
            portal.category_title("future_category")

    def test_operation_page_promotes_its_title_and_preserves_fenced_content(self):
        text = "## encoding.a\n\nDescription.\n\n\x60\x60\x60md\n## example heading\n\x60\x60\x60\n"
        page = portal.operation_sections(text)["encoding.a"]
        self.assertTrue(page.startswith("# encoding.a\n"))
        self.assertIn("\x60\x60\x60md\n## example heading\n\x60\x60\x60", page)

    def test_example_headings_do_not_become_operations(self):
        text = "# Reference\n## encoding.a\n\n\x60\x60\x60md\n## fake\n\x60\x60\x60\n## encoding.b\n"
        self.assertEqual(set(portal.operation_sections(text)), {"encoding.a", "encoding.b"})

    def test_duplicate_reference_ids_fail(self):
        with self.assertRaisesRegex(ValueError, "Duplicate reference"):
            portal.operation_sections("## encoding.a\n\n## encoding.a\n")

    def test_missing_catalog_entry_blocks_reference_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "contracts/v1").mkdir(parents=True)
            (root / "docs/reference").mkdir(parents=True)
            (root / "contracts/v1/catalog.json").write_text(json.dumps({
                "operations": [{"operation": "encoding.a"}, {"operation": "encoding.b"}]
            }))
            (root / "docs/reference/operations.md").write_text("## encoding.a\n")
            with self.assertRaisesRegex(ValueError, "Catalog/reference mismatch"):
                portal.operation_pages(root)

    def test_source_and_asset_links_use_the_documented_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            source = repository / "docs/guide.md"
            other = repository / "docs/reference.md"
            text = "[page](reference.md#details) [schema](../contracts/v1/catalog.json)"
            result = portal.rewrite(
                text, source, "cube/guides/first.md",
                {other.resolve(): "cube/reference/exact.md"},
                {"cube": repository},
                {"cube": {"revision": "a" * 40}},
            )
            self.assertIn("(../reference/exact.md#details)", result)
            self.assertIn("/blob/" + "a" * 40 + "/contracts/v1/catalog.json", result)

    def test_explicit_historical_source_link_remains_pinned(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            source = repository / "docs/guide.md"
            target = repository / "docs/reference.md"
            original = "[history](https://github.com/cubearc/cube/blob/" + "b" * 40 + "/docs/reference.md)"
            result = portal.rewrite(
                original, source, "cube/guide.md",
                {target.resolve(): "cube/reference.md"}, {"cube": repository},
                {"cube": {"revision": "a" * 40}}
            )
            self.assertEqual(result, original)


class PublishingChecks(unittest.TestCase):
    def test_locked_build_rejects_dirty_or_wrong_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(
                ["git", "-C", str(root), "-c", "user.name=Fixture",
                 "-c", "user.email=fixture@example.invalid", "commit",
                 "--allow-empty", "-qm", "fixture"], check=True
            )
            actual = portal.git(root, "rev-parse", "HEAD")
            self.assertEqual(portal.revision(root, actual, True)["revision"], actual)
            with self.assertRaisesRegex(ValueError, "locked build requires"):
                portal.revision(root, "0" * 40, True)
            (root / "unpublished.md").write_text("# local change\n")
            with self.assertRaisesRegex(ValueError, "dirty=True"):
                portal.revision(root, actual, True)

    def test_rendered_broken_fragment_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text('<a href="other.html#absent">next</a>')
            (root / "other.html").write_text('<h1 id="present">Other</h1>')
            with self.assertRaisesRegex(ValueError, "missing fragment"):
                portal.check_html(root)


if __name__ == "__main__":
    unittest.main()
