# Inspect operations visually

Open **All tools → Visual instruments** to choose a workbench, or use a supported
tool from its normal catalog entry. **Load Core example** loads a labeled,
synthetic conformance example. It does not run it. Review the input and press
**Run tools** to execute the installed local SDK in its dedicated worker.

Keyboard, Enigma, Polybius, Alberti and Solitaire use a full-width instrument
below a compact input strip. Expand **Input actions** for file loading, paste
and clear. Other workbenches place input and results beside the instrument on
wide screens. Narrow screens follow the order input, instrument, results.
The action selector and **Visual / Parameters** controls stay above the work area.

**Visual** and **Parameters** share one configuration. Selecting a cell, card,
node, byte or recorded trace step inspects data. Insertion, movement of cards,
mask edits and changes to graph edges explicitly edit the input or settings.
Dragging graph nodes changes only their drawing positions. Recorded traces are
not live debuggers. Enigma shows post-step windows; Solitaire and M-138-A show
initial configuration because their contracts return no movement trace.

Edits retain the previous result and label it as earlier evidence. Failed attempts
retain the last accepted result. Stop revokes pending reads/results and requests
the actual SDK worker termination; it does not establish Core completion or
cooperative cancellation. Secondary file/settings reads also disable Run and
reject completions after a newer read, an edit, Stop or leaving the instrument.

The main result is selected initially. Use **Choose an output** to inspect another
named result before copying, exporting or continuing. The normal
result viewer retains complete outputs even when a preview is shortened. Byte
exports retain bytes, and continuing as UTF-8 requires an explicit conversion.
Image decoding also uses a retained Session continuation, keeping the original
encoded file available in history. Image sampling and audio numerical analysis
use Core outputs, independently of canvas drawing or browser playback.

## Instruments and boundaries

| Instrument | Main interaction | Core evidence used |
| --- | --- | --- |
| Digital keyboard | Inspect/insert keys, compare physical positions across layouts, choose layers and displacement | Exact text, coordinate/position reports when supplied |
| Enigma | Initial rotors, windows, rings, reflector and disjoint plugs | Text, final windows, optional post-step windows |
| Solitaire | Inspect illustrated cards, then reorder all 54 cards with drag or movement buttons | Text; no invented deck trace |
| Scytale | Discrete columns and character inspection in strip/grid views | Text; no inferred source-to-destination mapping |
| Cardan | Toggle fixed mask holes, extract or overlay | Exact exposed/replaced characters and named outputs |
| Flag semaphore | Adjust anatomical arms, interpret pair and compose symbols | Canonical sender-facing arm pairs |
| Brainfuck | Edit program/byte stdin, inspect report tape and recorded steps | Final execution, report/compare, status and truncation |
| Image bit planes | Select channel/bit, inspect exact pixel, synchronized image views | Raw packed bits, valid bits and Core visual output |
| Alberti | Rotate exact 24-position rings, inspect recorded alignment, return to the editable initial alignment | Named text/settings, index and optional trace |
| M-138-A | Import full series, reorder distinct strips, edit block offsets | Text; explicit qualification series rather than an invented historical default |
| Pigpen | Compose canonical Haverhill pair glyphs, inspect/edit tokens | Exact profile definition and readings |
| Book cipher | Index reference text, select validated coordinates | Core word spans and complete coordinate validation; source SHA-256 |
| Audio | Select frames/channel, inspect waveform/spectrum/spectrogram | Core arrays with time/frame/Hz/amplitude units |
| Shortest path | Edit graph vertices/edges, position nodes, choose endpoints | Returned vertex/edge path; no weights or search trace |
| Eight-dot Braille | Toggle numbered dots, edit hex/binary, compose byte masks | Core-generated Unicode table and exact byte outputs |
| Morse | Dot, Dash, Next letter/word, Delete and explicit text/signals modes | Exact Core text/symbol conversion |
| Polybius | Inspect cells by click or arrow keys; choose Insert to compose; set origin/preset/custom square | Exact square configuration and aliases |
| Hex comparison | Inspect aligned rows, select ranges, navigate differences | Positional byte comparison, complete counts/listing status |
| Exact colors | Select exact original samples/palette entries, build mask/layer | Core histogram, selection counts and exported image bytes |
| PNG structure | Select chunks/signature/trailing bytes, inspect/export payload | Original byte offsets, payload/total lengths, CRC and boundary report |

Solitaire shows ranks, suit pips, illustrated courts and two distinct jokers.
Select a card to enlarge its face and inspect its position and numeric ID.
Faces follow the bridge-order convention in the
[Solitaire reference](https://www.schneier.com/academic/solitaire/): clubs 1–13,
diamonds 14–26, hearts 27–39 and spades 40–52, with Ace through King in each
suit. Core identifies Joker A as 53 and Joker B as 54. The portraits are
decorative; importing or moving cards preserves these exact IDs.

PNG structural inspection is separate from image decoding. A valid CRC is not a
security assessment. Color matching is exact, Braille represents byte masks,
and flag/Pigpen/Morse composition does not recognize photographs or microphone
input. Audio metadata availability does not imply a decoder for that format.

## Implementation ownership

`src/instruments/registry.mjs` describes presentation routing, supported operation
versions and profile selection. The SDK catalog still defines contracts;
executor metadata defines actual direct availability; adapter metadata defines
linear pipeline support. The build writes `instrument-matrix.json` containing
canonical versions, named port kinds and these separate capabilities. No
presentation entry creates a new executor or pipeline adapter.

`src/instruments/shell.mjs` adapts the existing Playground/session state to lazy
renderers. Canonical input/options stay in the Playground. Presentation selection,
zoom, layout and trace cursors stay separate. Named scroll surfaces retain pan
across inspection, parameter edits and tab changes; primary source replacements
reset their viewport scope. Focus is restored to stable controls, with an explicit
fallback when a control disappears or becomes unavailable. Each accepted run retains its
input/settings snapshot. The Session bounds accepted evidence to four MiB;
auxiliary media caches have their own four-MiB retention ceiling, clear obsolete
source buffers and dispose resources when leaving the instrument. Each auxiliary
view retains its producing selection/settings; a later pixel read or export cannot
relabel older masks, layers or spectra. Supplied PCM keeps its exact absolute
frame origin, with bounded relative coordinates used only for drawing.

`scripts/instrument-assets.mjs` projects factual definitions from the matching
Cube checkout and checks them using that exact installed Wasm. It supplies
canonical keyboard geometry, square/profile data, semaphore pairs and Braille
patterns to renderers. Profile-specific examples come from the matching Core
vectors and are checked in both directions through the installed SDK. Loading an
example retains the selected presentation profile; obsolete metadata responses
cannot replace newer input or feedback. Core remains responsible for every transformation,
interpreter, Fourier analysis and byte comparison.

Visual inspection is bounded without changing the original data: book indexing
retains at most 4,096 validated cells; graph drawing shows at most 100 nodes/200
edges with paged lists; tape, trace, image and byte drawing use bounded pages or
views. Full accepted outputs remain in the regular result/export path. Drawing
budgets and listing limits are labeled separately from execution completeness.

## Review with the real SDK

Build as described in `README.md`, then run the existing unit/integration suites
and the additional registered-action matrix:

```sh
npm test --prefix playground
CUBE_CONFORMANCE_FIXTURES=/absolute/path/to/cube/crates/cube-core/src/operations/contracts/conformance.json \
  node --test playground/tests/instruments.integration.mjs
```

Run the complete browser check through `npm run test:browser --prefix playground`
with the environment shown in `README.md`; the runner isolates each suite’s
evidence and includes the original catalog/pipeline tests. For a focused family
check, use distinct destinations (replace `workbench` with `symbol`, `mechanism`
or `media`):

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/cube/bindings/javascript/node_modules/playwright \
PLAYGROUND_EVIDENCE=/absolute/path/to/evidence/workbench \
PLAYGROUND_A11Y_REPORT=/absolute/path/to/evidence/workbench-a11y.json \
  node --test playground/tests/workbench-instruments.e2e.mjs
```

The suites serve localhost under `/docs/playground/` and execute the packed
Wasm/worker. They check known answers, invalid recovery, configuration sync,
selection without execution, earlier evidence, exact exports, keyboard/focus,
responsive layouts and automated accessibility rules. Inspect the screenshots and
retained incomplete accessibility checks. The focused `workbench-focus.e2e.mjs`, `mechanism-regressions.e2e.mjs`,
`media-continuation.e2e.mjs` and Chromium-only `symbol-accessibility.e2e.mjs`
cover keyboard focus/pan, exact invalid drafts, disposal and per-view provenance.
`instrument-targets.e2e.mjs` also loads examples through all twenty launchers and
measures enabled HTML targets (including the [SC2.5.8 spacing exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)) and application
containment at 390/320 CSS pixels,
without executing an operation on viewport changes. This is browser geometry
evidence, separate from physical touch-device qualification.

The accessibility inspection includes actual Chromium accessibility-tree names
and DOM bounds; it does not qualify native screen-reader behavior.

When running individual files, include `browser.e2e.mjs` for catalog, routes,
favorites, pipelines, persistence and delayed-file regressions.

Use the repository-locked browser harness/binaries when available. Record missing
bundles and separately identify any compatibility run with a matching cached
harness; it does not establish qualification of a different locked browser.
Automated checks complement native zoom, screen reader and physical-device review.
