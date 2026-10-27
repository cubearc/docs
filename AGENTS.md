# Documentation repository instructions

- Write English documentation and keep each page focused on one reader task.
- Follow [the shared authoring guide](content/contributing/documentation.md).
  Product-specific sources belong to their owning repositories.
- Edit canonical schemas and API definitions in Cube, then regenerate their
  reference. Preserve complete operation-ID parity.
- Keep product revisions explicit in `sources.lock.json`; never publish a
  dirty or silently mixed product checkout.
- Run the Python tool tests, local link checks and a locked site build for
  assembly changes. Match example validation to the interfaces changed.
- Keep generated `build/`, `site/` and downloaded `.tools/` files untracked.
- Use focused Conventional Commits. Track planning in GitHub Issues and
  CubeArc Roadmap; close work after integration and verified delivery.
