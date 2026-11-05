# Cube Playground

Static browser application owned by `cubearc/docs`. A persistent workbench
contains Multidecoder, individual tools and Pipelines. Algorithms, canonical contracts and
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
from `tools/tool-presentation.json` through the shared `tools/navigation.py`
projection; this editorial metadata does not define operation contracts or runtime support. Tool details are projected from the matching Cube checkout's reviewed
conformance cases and exact runtime contract hashes. The build rejects missing,
stale or duplicate IDs/versions/hashes, a mismatched source catalog/revision, and
dirty production example sources. Each selected tool shows synthetic named input,
options and expected output; these reference values neither execute nor establish
browser support. Precise contract JSON remains text so large schema integers
survive JavaScript parsing. Its common-tool presets are selection policy over discovered IDs.

## Work in the Playground

Use the persistent sidebar to search the complete catalog, open a category or
select a favorite. Selecting a grouped tool immediately opens its working input,
action selector, parameters and result. Base64 remains one tool with Encode and
Decode actions. **About this tool** contains descriptions, reference examples,
documentation and exact contract details. Loading an example explicitly replaces
input/settings; normal tool selection never does.

**Multidecoder** is the default for a fresh session. Its bounded set contains up
to six independently applied lightweight alternatives, all starting from the same
input snapshot. **Pipelines** is separate, explicit composition. Selecting tools
never adds steps. **Add to pipeline** appears only for a real linear adapter and
checks the receiving type/version and current options. Type changes require
explicit conversion steps; advanced imported definitions remain preserved.

Input, per-operation parameters/secondary inputs, action selection, presentation
state and sidebar search/category/scroll context survive internal navigation.
Desktop text tools put input and result side by side. Narrow layouts use a
keyboard-accessible Tools drawer and stacked work areas. Opening/closing the
drawer preserves the active workspace. Input/Result jumps preserve a selected
tool's canonical route. The shell stays mounted while operation views change;
result updates preserve input focus and stable result controls/disclosures.

## Automatic results and retained evidence

Automatic updates start enabled. Reviewed lightweight deterministic operations
can run from their first use, without a previous timing run. Text/settings edits
use a 250-ms debounce. The explicit policy in `src/execution-policy.mjs` combines
installed availability/version with a small reviewed operation set, at most 4 KiB
of primary input and 8 KiB of options/secondary inputs. It does not authorize the
whole catalog. Searches, programs, media work, generation, unknown operations,
large inputs and operations exceeding the live time budget keep an explicit
**Run** action and explanation. Runtime timings can suspend live updates; a fast
successful manual run can qualify that operation again. Automatic requests have
a two-second worker deadline. Deadline/Stop requests do not establish Core
completion or cooperative cancellation.

A live computation replaces one bounded **Live preview**. Typing consumes no
retained-round slots. **Keep result**, **Pin** and **Use as input** retain producing
evidence; explicit manual runs create retained rounds. Pins preserve values,
named-output choice, representations and their producing input/options. Earlier
input/configuration is labeled rather than presented as current. Empty output is
a valid result, distinct from absent evidence, updating, invalid input or a
failed execution. Only the newest accepted input/tool/run can receive a response.
The scheduler permits one active preview and one replaceable pending edit.
The visible earlier result stays inspectable while its replacement is computed.
Accepted alternatives commit together; a failed or revoked replacement leaves
the earlier evidence labeled as such. Staged results count toward the same
memory budget.

**Use as input** is explicit. Byte results offer exact bytes and, when valid,
an explicit UTF-8 conversion. **Restore previous input** reverses the last such
continuation, including exact bytes and its provenance path. **Used settings**
exposes the producing operation/options and retained secondary inputs; its run
export explicitly includes input/settings and uses the existing SDK's exact
serialization and transport limits. Output copying/downloading always uses the
complete selected named output, independently of preview truncation.

Local limits remain 128 KiB primary input, eight retained rounds, 24 results per
round, 16 pins and four MiB total retained input/result/provenance data, including
the visible preview, its staged replacement and reversible input. Runtime limits are separate and may be
lower for a particular operation/transport. No readability score claims a solve.
Original file bytes remain bytes across tool selection. Text-to-byte conversion
is controlled by the visible UTF-8 option; bytes are never silently reinterpreted
as text. Input/options stay in memory: reload restores route selection, not user
content or secrets. Saved pipelines still require explicit inclusion of input
and sensitive options; favorites alone persist as tool identities.

## Use visual instruments

Find instruments through their normal catalog categories: Enigma under Ciphers,
keyboard tools under Text and Unicode, symbolic tools under their catalog
category, media under Images/Audio, and byte/file tools under Files/Binary. The
existing registry chooses the appropriate lazy interface, version and profile;
there is no separate instrument launcher or algorithm catalog.

**Visual** and **Parameters** edit the same operation state. Data/parameter edits
can trigger an eligible preview; selection, zoom, layout, layer inspection and
recorded trace playback do not. Stateful previews start from the configured
initial state each time. They never accumulate rotor movement. Heavy instrument
analyses keep explicit controls. See [visual instruments](INSTRUMENTS.md) for
controls, boundaries and real-SDK/browser checks.

## Edit tool names and summaries

Edit `tools/tool-presentation.json` to update reader-facing language. Each tool
has an explicit `display_name` and `summary`. Every canonical operation has its
own `display_name`, `summary` and `tool_id` pointing to that tool. For example:

```json
{
  "tool_id": "cipher.book",
  "display_name": "Decode book coordinates",
  "summary": "Encode a message as positions in a reference text, or decode those positions using the same text."
}
```

The generated `presentation.json` carries those fields to the application.
Documentation titles use the same operation names. Group membership and labels
are explicit; the browser does not infer a tool from an action title or ID suffix.
Keep descriptions focused on input, useful transformation and output. Precise
Core descriptions, schemas and limits remain available under Technical details.

Keep familiar names and earlier terms in `aliases` when useful for search. If a
tool is split, list its prior key in `legacy_tool_ids` so saved favorites and
unversioned links still resolve. Exact canonical operation/version links retain
their identities. The build rejects missing or extra operation IDs, incomplete
fields, unused groups and groups spanning categories. Update the metadata when
adopting a Core catalog change; execution availability always comes from the SDK.

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
After building, provide the matching Core conformance file to verify saved
recipes, exact parameters, advanced definitions and the visual instruments
against the installed SDK:

```sh
CUBE_CONFORMANCE_FIXTURES=/absolute/path/to/cube/crates/cube-core/src/operations/contracts/conformance.json \
  node --test playground/tests/pipeline-import.integration.mjs \
    playground/tests/runtime.integration.mjs playground/tests/instruments.integration.mjs
```

`persistent-workbench.e2e.mjs` covers first-use automatic output, live replacement
without history growth, pins, per-tool configuration, reversible continuation,
file ownership, delayed worker responses, pipeline compatibility and narrow
keyboard navigation. It is included in the complete runner below. `BROWSER_ENGINE` may select
`chromium`, `firefox` or `webkit` for the end-to-end suite. Clipboard readback is
automated in Chromium; the other engines check success or the visible download
fallback when clipboard permission is unavailable.

The locked development-only `axe-core` engine runs WCAG 2, 2.1 and 2.2 A/AA tagged
rules against representative first-use, result, tool, error and narrow
layouts, including binary/Unicode files, empty input and long results. Populated
Decode/Encode results and the pipeline editor are checked at all six widths even
when screenshot export is disabled; long-output export/copy retain complete data. `PLAYGROUND_A11Y_REPORT=/path/to/report.json` retains the engine/browser
version, checked states, violations and checks needing manual review. Violations
fail the test; incomplete checks remain explicit rather than becoming passes.
These checks do not establish complete accessibility conformance or replace
native zoom, screen-reader and physical-device review. The audit library is not
included in the application output. Keyboard assertions additionally verify
focus after result filtering and moving, removing or restoring pipeline steps.

Canonical workspace links use `#/tools/<operation-id>/<operation-version>` and
open the working tool directly. Old unversioned family links remain aliases;
`#/playground` opens Multidecoder and `#/pipelines` opens Pipelines. Reload and
browser back/forward restore selection without embedding input or secrets in
the route. A mismatched version explains the issue and blocks execution until
**Open current version** is chosen. Legacy in-page fragments still initialize
the appropriate activity when loaded directly; normal jumps keep the tool route
and draft. Unknown/malformed links preserve input and offer recovery.

## Run the complete browser checks

After building, run every browser suite with separate logs, screenshots and
accessibility reports. The runner includes the original catalog/pipeline checks
and the visual-instrument regressions; one suite cannot overwrite another's
report. Repeat with `BROWSER_ENGINE=firefox` and `webkit`:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/cube/bindings/javascript/node_modules/playwright \
BROWSER_ENGINE=chromium \
PLAYGROUND_A11Y_REPORT=/absolute/path/to/evidence/chromium/report.json \
  npm run test:browser --prefix playground
```

Use the locked Playwright package to install its exact browser revisions if they
are missing. `PLAYWRIGHT_BROWSERS_PATH` may select a task-local browser directory.
The runner checks the built application; use individual tests for diagnostic
source overrides or case filters. The Pages workflow runs the complete suite in
all three engines and retains each report and screenshot directory. This is a
local/CI validation path; publishing still follows the authorization above.

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

The complete direct operation catalog is consumed from the qualified SDK. File
inspection sends actual selected bytes and reports unknown filesystem-only facts
as null. Direct execution and support for the existing linear pipeline model are
separate capabilities; adding a binding does not invent pipeline semantics.
