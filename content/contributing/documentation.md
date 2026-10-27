# Documentation guide

Help a reader finish a task or answer a specific question. Before writing, find
the existing page that owns the subject and check the implemented behavior.
Documentation, examples, contributor instructions and skills are written in English.

## Choose the page

| Change | Canonical home |
| --- | --- |
| Product purpose or first-use path | Repository README; keep capabilities grouped and examples minimal. |
| Installation or first successful result | Installation or Getting Started; move advanced workflows to Guides. |
| A new end-to-end task | One task guide with prerequisites, example, expected result and next step. |
| Shared meaning such as bytes, text or recipes | Concepts; link from tasks instead of repeating the explanation. |
| Parameters, formats, limits or exact operation behavior | Reference; keep essential caveats beside the action in a guide. |
| CLI I/O, Python types or Rust integration | The owning interface page and affected examples. |
| A new or changed operation | Rustdoc, descriptors/schemas, generated reference, interface signatures and affected examples. Add a guide only for a new reader task. |
| Architecture or extension contracts | Contributor documentation beside the owning code. |
| Implementation-only change | Commit or PR explanation unless it changes a durable contributor contract. |
| Reusable workflow or challenge | Recipes, linked from the portal. |
| Research or proposed behavior | Clearly marked contributor/research material. |

Keep a single authored explanation for each subject. Product-specific Markdown
belongs in the product repository; this repository owns shared editorial policy.
The portal assembles those sources at recorded commits.

## Write for the reader

- Give a page one primary goal. Lead with the action and expected result.
- Keep READMEs as entry points. Roughly 50–80 readable lines is a useful target
  where appropriate, not a quota or a CI gate.
- Prefer updating an existing page to appending another feature section.
- Explain a task once and put CLI/Python variants together when both help.
- Keep complete schemas and parameter lists in their canonical reference.
  Generated detail may be long; make it navigable rather than deleting facts.
- Put necessary format, privacy, overwrite and processing limits near the
  affected action. Link to full constraints instead of repeating warnings.
- Separate user tasks from internal protocols, storage schemas and implementation
  rationale. Keep the latter discoverable under contributor/reference sections.
- Describe available behavior. Label development builds, unsupported formats and
  unverified platform instructions accurately.

Use **challenge** for a generic activity, **recipe** for a reusable workflow and
**operation** for a named transformation. A pipeline composes compatible operations.
Keep intended product scope separate from delivered features.

## Keep examples trustworthy

Use small original fixtures and show the expected result. Preserve exact byte
semantics: decoding can return bytes, and displaying hexadecimal differs from
writing raw output. Do not assume a published package or executable exists.

Run changed examples against the real CLI, native Python extension or Rust API.
Use a scratch directory for output files. State prerequisites and explicit inputs;
do not rely on an unexplained fixture such as `sample.png`.

Validate the behavior affected by the edit. A spelling fix needs a rendering/link
review; a changed command needs a real invocation. A generator or contract change
also needs its existing drift and conformance checks.

## Update an operation

Rust descriptors and actual schemas own operation metadata; Clap owns command
arguments, Python stubs own SDK signatures and Rustdoc owns Rust API documentation.
Update those definitions and regenerate checked artifacts. Preserve exact catalog
coverage, operation/adapter versions and real execution availability.

Update the affected task example if behavior changed. The README changes only
when product positioning or the first-use route changes. A new operation does not
automatically need a new guide or an entry in every interface guide.

## Move or consolidate a page

Move the explanation to its canonical home, update local links and navigation,
and preserve old paths/anchors with short pointers when they have existing users.
Record the migration in the implementation PR. A pointer should identify the
destination and contain no second copy of the explanation.

For example, a guide teaching image histogram inspection links to the image
reference for exact color and sample limits. Adding another image operation
updates that reference and an affected example; it does not append image internals
to Getting Started.

## Review before submitting

Confirm the audience, canonical source, example result and navigation. Run local
Markdown/link checks and any affected reference or site build checks. Check the
page on GitHub as well as in the portal.

The PR should state the reader task, pages changed, reference impact and actual
validation. Say when a code change has no user-facing documentation impact.
Use the [page patterns](templates.md) only when a new page is justified.
