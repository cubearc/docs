---
name: cubearc-docs
description: Write, reorganize or review CubeArc documentation and its portal, using the shared editorial policy.
---

# CubeArc documentation

Read the [authoring guide](../../../content/contributing/documentation.md) and
applicable repository instructions. Work in the product repository that owns the
behavior; the portal owns shared policy and publication.

Find the existing canonical page before creating one. Choose the reader task and
keep shared explanation in one place. Use the guide's routing table for operation,
interface, architecture and recipe changes.

Choose one main interface per task. Put Python integration patterns in the SDK
guide instead of copying each CLI example. Add another interface example only
when it explains a distinct use case. Read the prose as user instructions:
explain the action and result, and keep authoring process out of product pages.

For reference, follow the guide's reference structure: a short overview,
descriptive sentence-case headings, tables for comparable rules/defaults/limits,
and lists for independent facts. Regroup mixed topics instead of adding headings
to dense paragraphs. Preserve exact semantics, bounds, result meanings and old
anchors. Keep code IDs out of reader-facing titles and avoid repeating schemas
or equivalent language examples. Review the rendered outline, table headers and
mobile layout, then try finding a default, limit and error rule by scanning.

Update affected examples, links and navigation. Generate reference from its
canonical definitions and use checks appropriate to the change.
For source/version or assembly changes, run the tool tests and locked site build.

Inspect `cubearc/docs` for every product-documentation delivery. Update
`sources.lock.json` to the validated product commits, and adjust affected shared
pages and reader-facing navigation names. Follow the guide's portal-delivery
section; product Markdown is not published until the portal adopts its revision.
Verify the authorized Pages deployment, or report the remaining publication step.

Preserve the requested mode: a review or planning request produces findings or a
plan; an implementation request produces the scoped changes and validation.
Report the pages changed and any remaining evidence or delivery gap.
