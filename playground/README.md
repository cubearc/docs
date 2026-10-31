# Cube Playground

Static browser application owned by `cubearc/docs`. The approved R2 direction
covers Playground, Pipelines and All tools. Algorithms, canonical contracts and
JavaScript/Wasm bindings belong to `cubearc/cube`.

## Build a local preview

Use Node.js 22 or 24 and Python 3. Build and pack the actual Cube JavaScript SDK
first, following its interface guide. Then, from this repository:

```sh
node playground/scripts/build.mjs --sdk /path/to/cubearc-cube-0.18.0.tgz --cube-source /path/to/cube --development
npm test --prefix playground
```

Serve `playground/dist/` through localhost or HTTPS. Opening `index.html` with
`file:` cannot load a module worker. The browser loads only local static assets;
input text/files are passed to the dedicated SDK worker. There is no account,
application backend or cloud execution service.

The build installs the provided tarball offline with lifecycle scripts disabled,
uses its actual runtime catalog and capability metadata, and stages its exact
Wasm/module assets under a source-fingerprint directory. Presentation names come
from the existing `tools/navigation.py`; this app has no competing operation
registry. Tool details are projected from the matching Cube checkout's reviewed
conformance cases and exact runtime contract hashes. The build rejects missing,
stale or duplicate IDs/versions/hashes, a mismatched source catalog/revision, and
dirty production example sources. Each selected tool shows synthetic named input,
options and expected output; these reference values neither execute nor establish
browser support. Precise contract JSON remains text so large schema integers
survive JavaScript parsing. Its common-tool presets are selection policy over discovered IDs.

The first local limits are 128 KiB input, eight retained rounds, 24 results per
round, 16 pins and four MiB retained result/provenance data. Runtime limits are
separate and may be lower for a particular operation or transport. Errors and
unavailable operations remain discoverable. No readability score claims a solve;
encoding alternatives are equally relevant. Selecting another tool, stopping or
starting an explicit run revokes queued automatic comparisons; it does not
relabel earlier results as work from the new selection.

## Validate actual integration

Provide the Playwright module from the SDK's locked development dependencies:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix playground
PLAYWRIGHT_MODULE=/absolute/path/to/cube/bindings/javascript/node_modules/playwright \
  node --test playground/tests/browser.e2e.mjs
```

`BROWSER_EXECUTABLE` may select a local Chrome installation.
`PLAYGROUND_EVIDENCE` selects an output directory for actual screenshots. The test
uses the installed package and Wasm under `/docs/playground/`, including byte
exports, Continue provenance, intermediate results, local persistence, invalid
input and layouts at 320, 390, 700, 834, 1100 and 1440 CSS pixels. These checks
complement manual keyboard/touch/zoom and assistive-technology review; passing
unit tests or ImageGen boards does not establish those properties. The automated
suite also checks 200% CSS text enlargement at 1440/834/320 pixels and a short
844×390 landscape viewport. CSS text enlargement is distinct from native browser
zoom, screen-reader review and physical-device qualification.
Run `node --test playground/tests/pipeline-import.integration.mjs` after building
to check editable saved recipes, exact parameters and preserved advanced
definitions against the installed actual SDK. `BROWSER_ENGINE` may select
`chromium`, `firefox` or `webkit` for the end-to-end suite. Clipboard readback is
automated in Chromium; the other engines check success or the visible download
fallback when clipboard permission is unavailable.

The locked development-only `axe-core` engine runs WCAG 2, 2.1 and 2.2 A/AA tagged
rules against fifteen representative first-use, result, tool, error and narrow
layouts, including binary/Unicode files, empty input and long results. Populated
Decode/Encode results and the pipeline editor are checked at all six widths even
when screenshot export is disabled; long-output export/copy retain complete data. `PLAYGROUND_A11Y_REPORT=/path/to/report.json` retains the engine/browser
version, checked states, violations and checks needing manual review. Violations
fail the test; incomplete checks remain explicit rather than becoming passes.
These checks do not establish complete accessibility conformance or replace
native zoom, screen-reader and physical-device review. The audit library is not
included in the application output. Keyboard assertions additionally verify
focus after result filtering and moving, removing or restoring pipeline steps.

Exact catalog links use `#/tools/<operation-id>/<operation-version>`. Old
unversioned family links remain aliases. Opening a different operation version
shows an explanation and disables execution until the user explicitly chooses
the current version. Mobile Input/Results and pipeline jump fragments also
initialize a ready section when opened directly or refreshed; existing in-page
jumps preserve the active draft. Selection and action changes update the link; refresh keeps
the chosen grouped action. Unknown/malformed links provide a route back.

## Save and import pipelines

The primary editor is an ordered Core Recipe, preserving explicit typed
conversions, versions and options. Move up/down controls work without dragging;
Pending input reads and definition imports are scoped to their selection and
producing draft. New edits, Stop, a later selection or a replacement draft reject
older completions; background completion preserves another section's focus.
Run waits until the accepted input is ready. Keyboard focus follows the moved step, the nearest remaining step after removal,
and the restored step after Undo.
Every accepted run retains its producing input/configuration and captures; edits
label the previous result and reject late responses.

Saved/exported documents use the versioned `cubearc.playground.pipeline`
envelope. `definition_json` preserves exact Core JSON. `input_data_json` is a
separate optional bindings document. Input data and sensitive options are omitted
by default; omitted keys produce an incomplete draft that requires those options
before running. The library permits 20 documents within 240 KiB and writes
atomically. Corrupt data remains available for recovery before an explicit reset.
Loading/importing never runs a definition. Core validates complete imported
recipes; Play graphs are rejected rather than flattened. Ordinary text/byte
recipes reopen as editable ordered steps, preserving operation versions, named
input slots and exact parameters. Included data is restored separately. Recipes
with explicit lowered limits, wide integers or input kinds outside the form
editor remain in a preserved-definition view with typed input bindings; they are
never silently narrowed to fit the form.

## Join the documentation artifact

Production builds require `--sdk-sha256 HASH`, a clean SDK source revision equal
to `sources.lock.json`, and matching catalog/package identities. Dirty builds are
local previews and cannot be adopted as a product revision.

```sh
node playground/scripts/build.mjs --sdk /path/to/sdk.tgz --sdk-sha256 REVIEWED_HASH --cube-source /path/to/pinned/cube
python3 tools/site.py build --sources-root /path/to/sources --locked --playground playground/dist
```

The app goes into the existing `site/playground/` artifact, published at
`/docs/playground/`. The docs landing page gains one normal link. mdBook chapters,
search, theme and existing URLs retain their build boundaries. The Pages workflow
builds the application only when the reviewed Cube lock actually contains the
SDK; adopting that revision is a separate delivery step after Cube integration.
No workflow in this change publishes npm packages. A push to docs `main` invokes
the existing Pages deployment, so do not push until publication is authorized.
