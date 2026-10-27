# Contributing to CubeArc documentation

Start with the [authoring guide](content/contributing/documentation.md).
Change a product's documentation in that product repository and link its PR
to the coordinating documentation issue.

For site changes, use Python 3.12+, install the pinned mdBook binary and run:

```sh
python3 -m unittest discover -s tests
python3 tools/check_links.py .
python3 tools/site.py build --sources-root ..
```

Before publication, use clean checkouts matching `sources.lock.json` and add
`--locked` to the build command. See [site maintenance](content/contributing/site.md).

In the PR, identify the reader task, canonical pages changed, generated reference
impact and validation actually performed. Explain when no user documentation
changes are needed. Keep Conventional Commits and reference the relevant issue.
