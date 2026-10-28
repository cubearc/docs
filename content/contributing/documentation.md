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

## Move or consolidate a page

Update links and navigation. Keep old paths and section anchors working with
short pointers where needed, and record the move in the PR.

Preserve technical details that readers need in the reference. Repeated examples
can be removed when they add no separate explanation.

## Review before submitting

Read the page as a user: are the input, action and result clear? Remove empty
sections, repeated warnings and unexplained jargon.

Check changed examples, local links and the rendered page. Run the existing
generator, conformance or site checks when the change affects them. In the PR,
name the pages changed and the checks actually run.

Use the [page patterns](templates.md) as a starting point, not a required outline.

<a id="keep-examples-trustworthy"></a>
