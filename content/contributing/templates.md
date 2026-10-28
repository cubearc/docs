# Page patterns

Use only the sections that help the reader. Short pages do not need a heading
for every paragraph.

## Getting Started

Give the reader one small success:

1. State the result and link to installation.
2. Show the input and one working command.
3. Explain the output.
4. Link to the next useful task.

For Cube, decoding `SGVsbG8=` to `Hello` is enough for a first result.

## Task guide

Use a title that describes an action, such as “Extract a channel from an image”.

Start with when the task is useful and the input it needs. Show the main steps,
then explain what the result means. Keep a necessary caveat beside the step it
affects. Link to the reference for complete options and limits.

Choose one interface for the walkthrough. Add another example only when it
teaches a different use case; SDK integration belongs in the SDK guide.

## Concept

Answer a question such as “Why does decoding display hexadecimal?”

Explain the distinction with a small example and link to a task that uses it.
Keep command lists and API details in the reference.

## Reference

Help the reader look something up: inputs, outputs, parameters, supported formats
and limits. Start with one or two sentences about the feature. Choose sections
from this pattern according to the facts the reader needs:

| Section | Content |
| --- | --- |
| Operations or supported formats | A comparison table with short descriptions |
| Parameters and defaults | Setting, default and valid values |
| Behavior | Units, ordering, normalization, edge cases and result meaning |
| Limits | Resource, maximum and what happens when exceeded |
| Example | One small input and its expected result |
| Related tasks | Links to walkthroughs or interface integration |

For a broad family, give each operation group its own section and place its rules
and limits below it. Use headings that name the subject, such as “Fixed-width
arithmetic”. Keep long explanations out of table cells, and keep implementation
history out of the lookup path.

Link shared Concepts for vocabulary such as scalars, work budgets or incomplete
results. Keep the operation's exact values and failure policy here. A reference
should let the reader find those facts without rereading a general explanation.

For operation contracts, update the source definitions and generate the reference.
Do not reproduce generated parameter schemas in a hand-written page; explain
the rules that need context and link to the exact contract.

## Improve an existing page

If a command changes, update its example and expected output.
If the behavior is already explained elsewhere, link to that explanation.
Create a page only when the reader has a new task or question.
