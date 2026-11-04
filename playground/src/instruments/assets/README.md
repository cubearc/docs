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
