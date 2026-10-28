# Site maintenance

The portal uses mdBook 0.5.4. Its built-in search, syntax highlighting and
relative page URLs work on GitHub Pages without a backend. The assembly tools
use Python's standard library; product runtimes gain no documentation dependency.

## Build

Check out `docs`, `cube`, `play` and `recipes` side by side, then run from docs:

```sh
python3 tools/install_mdbook.py
python3 -m unittest discover -s tests
python3 tools/check_links.py .
python3 tools/site.py build --sources-root ..
```

The installer verifies checksums from the official mdBook release.
Generated Markdown lives in `build/src` and rendered HTML in `site`;
both are ignored. Serve `site` with `python3 -m http.server` for a local preview.

## Adopt a product revision

1. Merge the product's code and documentation together.
2. Update its full commit SHA in `sources.lock.json` in a docs PR.
3. Check out all recorded product commits and build with `--locked`.
4. Review the version page, changed tasks and operation-ID parity before merging.

A locked build rejects dirty or mismatched product checkouts. Local previews may
use uncommitted sources and label them as unpublished edits. Each rendered source
page links to its owning repository and records its commit.
Do not add a release selector until real maintained release documentation exists.

## Publish and recover

The Pages workflow validates the site in PRs and deploys the verified artifact
from `main`. Configure the repository's Pages source as GitHub Actions.
The project site is served under `/docs/`; keep that base path in `book.toml`.

If publishing fails, inspect its build/deploy logs, reproduce the locked build
locally and fix the source or manifest in a PR. The last successful Pages artifact
remains available. Fix obsolete product links in their source repository and then
adopt that revision here.

The source link checker validates local files and GitHub-style heading fragments.
The site build also checks rendered HTML targets/fragments. External URLs remain
external sources; these checks do not claim to verify their live content.

## Maintain the theme

`theme/cubearc.css` and `theme/cubearc.js` adapt mdBook's native navigation,
search and theme controls. Keep product navigation, keyboard search, mobile
navigation and dark mode working when changing them. Review the home page and
a task page at desktop and mobile widths before publishing.

`tools/navigation.py` owns presentation names for reference categories and
operations. Its naming patterns cover regular families; explicit titles cover
other actions. Before adopting new operations, review their names for a human
reader. An unknown operation or category blocks publication until it has a
readable title. These names do not change canonical IDs, schemas or URLs.

The local Inter font in `assets/fonts/` comes from
[Inter 4.1](https://github.com/rsms/inter/tree/e3a3d4c57d5ecc01453a575621882a384c1995a3).
Keep its SIL Open Font License with the font file. The build copies these assets
into the site so readers do not need a third-party font service.
