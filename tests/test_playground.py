"""The application joins the existing Pages artifact only with matching identity."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('stage_playground', Path(__file__).parents[1] / 'tools/stage_playground.py')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)

class PlaygroundStaging(unittest.TestCase):
    def test_missing_or_development_runtime_cannot_be_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); app = root / 'app'; site = root / 'site'
            app.mkdir(); site.mkdir(); (site / 'index.html').write_text('Existing docs')
            with self.assertRaisesRegex(ValueError, 'report'):
                stage.stage(app, site, 'a' * 40)
            (app / 'build-report.json').write_text(json.dumps({'development': True, 'sdk': {}}))
            with self.assertRaisesRegex(ValueError, 'development'):
                stage.stage(app, site, 'a' * 40)
            self.assertEqual((site / 'index.html').read_text(), 'Existing docs')

    def test_clean_matching_runtime_is_isolated_and_has_a_docs_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); app = root / 'app'; site = root / 'site'
            app.mkdir(); site.mkdir(); (site / 'index.html').write_text('<main>Existing docs</main>')
            for file in ['index.html', 'app.mjs', 'styles.css', 'runtime-config.mjs']:
                (app / file).write_text('asset')
            (app / 'catalog.json').write_text('{"operations":[]}')
            report = {'development': False, 'sdk': {'sourceDirty': False, 'coreRevision': 'a' * 40, 'catalogSha256': hashlib.sha256((app / 'catalog.json').read_bytes()).hexdigest()}}
            (app / 'build-report.json').write_text(json.dumps(report))
            (site / 'catalog.json').write_bytes((app / 'catalog.json').read_bytes())
            stage.stage(app, site, 'a' * 40)
            self.assertTrue((site / 'playground/app.mjs').is_file())
            self.assertIn('Existing docs', (site / 'index.html').read_text())
            self.assertIn('playground/', (site / 'index.html').read_text())
            report['sdk']['coreRevision'] = 'b' * 40
            (app / 'build-report.json').write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, 'revision'):
                stage.stage(app, site, 'a' * 40)

class PlaygroundRoutes(unittest.TestCase):
    def test_only_app_entry_routes_are_not_dom_fragments(self):
        import sys
        sys.path.insert(0, str(Path(__file__).parents[1] / 'tools'))
        site_spec = importlib.util.spec_from_file_location('docs_site_routes', Path(__file__).parents[1] / 'tools/site.py')
        portal = importlib.util.module_from_spec(site_spec); site_spec.loader.exec_module(portal)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); app = root / 'playground'; app.mkdir()
            (app / 'index.html').write_text('<a href="#/playground">Playground</a><a href="#/pipelines">Pipelines</a><a href="#/tools">Tools</a>')
            portal.check_html(root)
            (app / 'index.html').write_text('<a href="#/missing">Broken route</a>')
            with self.assertRaisesRegex(ValueError, 'missing fragment'):
                portal.check_html(root)
