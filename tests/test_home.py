"""Homepage publication must retain the documentation entry and local links."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import site_home


class HomePublication(unittest.TestCase):
    def test_staging_keeps_docs_and_validates_home_destinations(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site = root / 'site'
            home = root / 'home'
            site.mkdir()
            home.mkdir()
            (site / 'index.html').write_text('<h1 id="docs">Documentation</h1>')
            (home / 'index.html').write_text('<h1>Create challenges</h1><a href="documentation.html#docs">Docs</a><a href="playground/">Tools</a>')
            (home / 'styles.css').write_text('body {color: navy}')
            site_home.stage(home, site)
            self.assertFalse((site / 'home/index.html').exists())
            self.assertIn('Create challenges', (site / 'index.html').read_text())
            self.assertIn('https://cubearc.github.io/docs/playground/', (site / 'index.html').read_text())
            self.assertIn('Documentation', (site / 'documentation.html').read_text())
            self.assertEqual((site / 'home/styles.css').read_text(), 'body {color: navy}')
