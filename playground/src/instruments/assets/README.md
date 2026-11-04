# Semaphore character

`semaphore-body.png`, `semaphore-left-arm.png` and `semaphore-right-arm.png`
are original transparent character sprites generated with built-in ImageGen on
2026-11-04 from the approved cartoon semaphore design study. The body and each
arm are separate so the renderer can position both arms using actual selected
directions. Clothing, facial details and fabric folds are illustrative artwork;
direction labels, symbol correspondence, selections and results remain data.
The sprite contains no authoritative text or execution state. Prompts and source
provenance are recorded in workspace `.validation/cartoon-instruments/`.

# Solitaire portraits

`solitaire-court-portraits.png` is original decorative artwork generated with
the built-in ImageGen tool on 2026-11-03. Its five equal columns contain a Jack,
Queen, King, navy joker and crimson joker. The transparent 1983×793 PNG is loaded
only when a Solitaire face with a portrait is rendered and reused by all cards.
SVG viewports select its columns without altering the original bitmap.

The artwork contains no authoritative ranks, suit values, card IDs or results.
`solitaire-cards.mjs` renders those separately. The display convention follows
the bridge suit order in [the original Solitaire reference](https://www.schneier.com/academic/solitaire/),
which is also linked by the locked Core catalog. Jokers retain Core IDs 53/54.

Generation direction: traditional engraved French court busts in navy, crimson,
antique gold and cream. Jack with feathered cap and halberd; crowned Queen with
flower; crowned, bearded King with sword; two jesters with distinct poses and
small/large stars. Five equal columns on transparency; no card rectangles,
typography, rank numbers or suit marks. Exact prompt and original generation
path are recorded in workspace `.validation/solitaire-card-faces/`.

# Earlier design materials

`premium-walnut.png` and `premium-compass.png` are original decorative ImageGen
assets generated on 2026-11-03 for the earlier keyboard and Alberti design.
They are retained as design sources; the illustrated instruments use code-drawn
surfaces and a static gear hub. Letters, sectors, controls and readouts remain
DOM/SVG drawn from actual data.

`premium-flourish.svg` is an original vector corner engraving. Two generated
ornament candidates were rejected because they retained an opaque halo. The
vector ornament provided clean transparent edges without modifying those images.
It is retained as an earlier design source. Decorative artwork is excluded from
accessible control names.

Exact concept and material prompts, rejected candidates and validation history
are recorded in workspace `.validation/premium-instruments/`. These assets are
loaded when their instrument is rendered; no external asset service is used.
