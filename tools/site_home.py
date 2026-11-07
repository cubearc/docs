"""Publish the product home while keeping mdBook's documentation entry."""
import shutil


def stage(source, site):
    shutil.copyfile(site / 'index.html', site / 'documentation.html')
    assets = site / 'home'
    if assets.exists():
        shutil.rmtree(assets)
    shutil.copytree(source, assets, ignore=shutil.ignore_patterns('index.html'))
    content = (source / 'index.html').read_text()
    if not (site / 'playground/index.html').is_file():
        content = content.replace('href="playground/"', 'href="https://cubearc.github.io/docs/playground/"')
    (site / 'index.html').write_text(content)
