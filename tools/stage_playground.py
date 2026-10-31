"""Join an independently built app to the existing mdBook artifact after identity checks."""
import hashlib
import json
import shutil
from pathlib import Path


def stage(application: Path, site: Path, cube_revision: str, *, development=False):
    report_file = application / 'build-report.json'
    if not report_file.is_file():
        raise ValueError('Missing Playground build report; build the actual SDK application first.')
    report = json.loads(report_file.read_text())
    sdk = report.get('sdk', {})
    if not development and (report.get('development') is not False or sdk.get('sourceDirty') is not False):
        raise ValueError('A development or dirty runtime cannot be published.')
    if sdk.get('coreRevision') != cube_revision:
        raise ValueError('Playground SDK revision differs from the documentation source lock.')
    for required in ['index.html', 'app.mjs', 'styles.css', 'runtime-config.mjs', 'catalog.json']:
        if not (application / required).is_file():
            raise ValueError(f'Missing Playground asset: {required}')
    catalog = (application / 'catalog.json').read_text().strip().encode()
    if hashlib.sha256(catalog).hexdigest() != sdk.get('catalogSha256'):
        raise ValueError('Playground catalog identity differs from its SDK.')
    docs_catalog = (site / 'catalog.json').read_text().strip().encode()
    if hashlib.sha256(docs_catalog).hexdigest() != sdk.get('catalogSha256'):
        raise ValueError('Playground and documentation catalog identities differ.')
    if any(path.is_symlink() for path in application.rglob('*')):
        raise ValueError('Playground assets must not contain symbolic links.')
    destination = site / 'playground'
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(application, destination)
    # The application is a separate document tree. mdBook keeps its own search,
    # chapter URLs and layout; its landing page gains one normal navigation link.
    landing = site / 'index.html'
    html = landing.read_text()
    marker = '<a class="playground-entry" href="playground/">Open Cube Playground →</a>'
    if marker not in html:
        html = html.replace('<main>', '<main>\n<p>' + marker + '</p>', 1)
        landing.write_text(html)
