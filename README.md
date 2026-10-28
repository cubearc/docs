# CubeArc documentation

The [documentation portal](https://cubearc.github.io/docs/) for [Cube](https://github.com/cubearc/cube),
[Cube Play](https://github.com/cubearc/play) and
[Recipes](https://github.com/cubearc/recipes).
Product guides live beside their code; this repository owns the shared
authoring policy, site assembly and GitHub Pages publishing.

## Preview

Use Python 3.12+, Git and curl. Check out the four repositories side by side,
using the product revisions in `sources.lock.json` for a reproducible first build.
From this repository:

```sh
python3 tools/install_mdbook.py
python3 tools/site.py build --sources-root ..
python3 -m http.server 8000 --directory site
```

Open http://localhost:8000. The installer verifies the pinned official mdBook
binary's SHA-256. Local builds identify unpublished source edits.

## Contribute

- Follow the [documentation guide](content/contributing/documentation.md).
- Use the [page patterns](content/contributing/templates.md) when a new page is needed.
- Read [site maintenance](content/contributing/site.md) for locked builds,
  version updates, checks and publication.
- Run `python3 -m unittest discover -s tests` after changing the site tools.

GitHub Actions builds the revisions in [sources.lock.json](sources.lock.json).
Update that manifest when adopting a reviewed product documentation change.
Track work in [GitHub Issues](https://github.com/cubearc/docs/issues) and
[CubeArc Roadmap](https://github.com/orgs/cubearc/projects/1).
