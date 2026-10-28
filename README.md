# CubeArc documentation

> [!WARNING]
> **Beta software.** CubeArc projects are under active development and are not yet
> stable. Features, APIs, file formats and workflows may change without backward
> compatibility. Bugs and incomplete features are expected. Keep backups of
> important data and independently verify results before relying on them.

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

## Support CubeArc

Help support CubeArc development with a cryptocurrency donation.
Send only the listed currency on its native network.

| Currency | Donation address |
| --- | --- |
| <img src="assets/donations/btc.svg" width="24" height="24" alt="Bitcoin"> **Bitcoin (BTC)** | `bc1q7lw966p5069wr6z3czhdkua6e6ym52kgqe8qhr` |
| <img src="assets/donations/eth.svg" width="24" height="24" alt="Ethereum"> **Ethereum (ETH)** | `0x0Da7C21897aDC34a0A91B1de802385d845D48858` |
| <img src="assets/donations/zec.svg" width="24" height="24" alt="Zcash"> **Zcash (ZEC)** | `t1LbSr9K1v7Du5DVeQY9HxRJqB3cc7Pa9QP` |
