# Documentation guide

Write for someone trying to use CubeArc. Explain what they can do, show the
shortest useful example, and describe the result. Write documentation and
contributor instructions in English.

## Choose the page

| Reader needs to… | Put it in… |
| --- | --- |
| Understand the product and start using it | README |
| Install it or get a first result | Installation or Getting Started |
| Complete a task | A task guide |
| Understand bytes, text, recipes or another shared idea | Concepts |
| Look up parameters, formats, limits or return values | Reference |
| Use Cube from Python or Rust | The SDK or interface guide |
| Extend the code or publish documentation | Contributing |
| Reuse a workflow | Recipes |

Look for an existing page before creating one. Product documentation lives beside
its code; this repository owns the portal and shared writing guidance.

## Write for the reader

- Open with the task and the result. Prefer “Read the red channel” to “Perform
  bounded channel analysis.”
- Show one useful path through the task. Explain commands before adding more of
  them, and explain output instead of leaving a wall of code.
- Keep READMEs short enough to scan. Link to installation, guides and reference
  instead of repeating them.
- Explain shared concepts once and link to them. Include a limit or caveat in a
  guide when it changes what the reader should do.
- Keep implementation notes and contributor instructions under Contributing.
  A user guide should not discuss how to update its own documentation.
- Describe current behavior. Avoid change-log wording such as “the new operation”
  or “existing behavior remains unchanged.”
- Use readable titles and menu labels: “Decode Base64”, “Binary”, “Images”.
  Keep technical IDs in reference metadata and search, and preserve stable URLs.

Use **challenge** for an activity, **recipe** for a reusable workflow and
**operation** for a transformation. Distinguish available features from proposals.

## Structure a reference page

Reference answers a lookup question. Start with a short description of what the
feature does, then organize facts by operation, input, output, rules and limits.
Link to a task guide for the walkthrough.

- Use descriptive, sentence-case headings. Group related facts under a heading
  the reader can find from the page outline, such as “Byte order” or “Input limits”.
- Put the defining rule first. Keep each paragraph about one idea; separate
  behavior, resource limits and implementation background.
- Use tables when readers need to compare the same properties: operation and
  behavior, parameter and default, or resource and maximum. Give columns concise
  headers. Keep cells short; explain complex rules below the table.
- Use bullets for independent rules and numbered steps for an actual sequence.
  Do not turn every sentence into a bullet or repeat a table in prose.
- Show a small example when it resolves ambiguity. Include the expected result;
  avoid copying the task guide or adding every language binding.
- Keep exact units, defaults, boundary cases, result meanings and failure behavior.
  Separate a listing cap from a computation limit, and metadata from verified data.
- Name operations for people in titles and navigation. Put exact IDs in code
  formatting where they help identify an API.

When revising dense prose, regroup and rewrite it. Adding a heading above each
old paragraph does not resolve mixed topics. Put contributor workflow, release
history and proposals in their appropriate pages or issues.

Use [Binary](https://cubearc.github.io/docs/cube/reference/topics/binary-transformations.html)
as a compact reference example. These conventions follow Google's guidance on
[paragraphs](https://developers.google.com/style/paragraph-structure),
[headings](https://developers.google.com/style/headings) and
[tables](https://developers.google.com/style/tables), and Microsoft's
[scannable content](https://learn.microsoft.com/en-us/style-guide/scannable-content/).

## Choose examples

Use one main interface for a task; the Cube task guides normally use the CLI.
Make Python and Rust support easy to find from the product overview and guides
index. Their own pages explain installation, types, errors and integration.

Do not add a Python version of every command. Include another interface example
when it teaches something different, such as working with an in-memory image or
embedding a pipeline in an application. Put that example in the SDK guide, or in
a dedicated integration guide if the task needs more space.

Use a small sample input and state the expected output. Link to a sample-file
recipe or show how to create the input. Label examples that require the reader's
own file, including any format requirements.

Run changed examples with the real CLI, native Python extension or Rust API.
Use a scratch directory for output files. Keep byte output distinct from its
hexadecimal display, and do not assume a package has been published.

## Update an operation

Update its Rust API documentation, descriptors, schemas and interface signatures,
then regenerate the operation reference. Keep all supported operations covered.
Do not hand-edit generated schemas or copy their parameter lists into guides.

Change a task example when its behavior changes. A new operation does not
automatically need a new guide, a Python walkthrough or a README section.

## Deliver documentation to the portal

Product documentation and the published portal have separate repositories.
For a change to Cube, Play or Recipes documentation, inspect `cubearc/docs` as
part of the same delivery. Merging product Markdown alone does not update the
portal: `docs/sources.lock.json` selects the published product revisions.

After the product change is committed and validated, update its full SHA in that
manifest and any affected shared pages or navigation names. New operation IDs
and categories need readable titles in `docs/tools/navigation.py`; the locked
build must retain exact catalog/reference parity. Keep product semantics in the
owning repository rather than copying them into the portal repository.

Follow [site maintenance](site.md#adopt-a-product-revision) for clean pinned
checkouts, tool tests, link checks, the locked build and publication verification.
Complete these steps within the authorized delivery scope. For review-only work,
report the required portal changes; when no portal update is needed, explain why.

## Move or consolidate a page

Update links and navigation. Keep old paths and section anchors working with
short pointers where needed, and record the move in the PR.

Preserve technical details that readers need in the reference. Repeated examples
can be removed when they add no separate explanation.

## Review before submitting

Read the page as a user: are the input, action and result clear? Remove empty
sections, repeated warnings and unexplained jargon.

For reference, try finding a default, a limit and an error rule without reading
the whole page. Review the heading outline and tables on a narrow screen. Check
that table headers are semantic column headers, and that technical details and
old section links survived the edit.

Check changed examples, local links and the rendered page. Run the existing
generator, conformance or site checks when the change affects them. In the PR,
name the pages changed and the checks actually run.

Use the [page patterns](templates.md) as a starting point, not a required outline.

<a id="keep-examples-trustworthy"></a>
