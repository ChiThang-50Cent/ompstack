---
name: pstack-show-me-your-work
description: Keep a reviewable decision trail for long-running, unattended, autonomous, or multi-phase work. Use pstack_decision as the canonical store and optionally export a local TSV log for reviewers.
disable-model-invocation: true
---

# Show me your work

Keep one canonical decision trail. The pstack decision ledger is the primary store. The TSV file is an optional local or committed export for a reviewer who needs a readable table.

## Canonical decision record

For each meaningful decision, checkpoint, pivot, revert, blocker, or gate fix, the parent records one decision with `pstack_decision`:

```json
{
  "decision": "what was chosen or done",
  "why": "the reason in plain words",
  "phase": "phase or workstream",
  "evidenceRefs": ["commit SHA", "file:line", "artifact://...", "trace or screenshot path"],
  "result": "tests green | reverted | INCONCLUSIVE | open"
}
```

Evidence is a pointer, not a paragraph. Record verification outcomes and predicate state. Do not turn every shell command into a row. A decision trail records what changed the run or what a reviewer must understand.

Use `pstack_decision` from the parent session. A child reports proposed rows to the parent instead of mutating parent audit state. If the runtime cannot record a decision, report the exact missing capability and keep the row in the optional export until the parent can ingest it.

## Optional TSV export

When a human needs a file, copy `references/decision-log-template.tsv` to a fresh path such as `decisions.tsv` or `.audit/<task-slug>.tsv`. Keep one row per decision and keep every cell on one line. Columns:

- `ts`: ISO8601 timestamp.
- `phase`: phase or workstream.
- `decision`: one-line action or choice.
- `why`: plain-language reason. If a principle drove it, name the rule in ordinary words.
- `evidence`: a resolving path or identifier, never a paragraph.
- `result`: predicate state such as `tests green`, `reverted`, `INCONCLUSIVE`, or `open`.

Use `scripts/log.sh <logfile> <phase> <decision> <why> <evidence> <result>` to append an export row. It creates the header, strips tabs and newlines, and prefixes cells beginning with `=`, `+`, `-`, or `@` so spreadsheet readers do not execute generated or user-supplied text as formulas. A direct append is allowed only when it preserves those invariants.

The export is append-only. A wrong call gets a new row that supersedes it. Never edit or delete history. Prefer evidence from committed checks over hand-made one-off claims.

## Where the trail lives

The pstack ledger lives in the active run's audit state. Keep the TSV out of Git by default. Commit it only when the work is ambitious enough that a reviewer needs the trail to trust the result, or when the user explicitly asks for the export. Do not create a second canonical log in another format.

## Audit the trail

Before handing back, compare this run's decision records with the active OMP transcript using `skill://pstack-recall` session rules. Do not glob across unrelated project sessions. Check:

- Every row maps to a real decision or action.
- Every evidence reference resolves and supports its claim.
- Every fork, pivot, abandoned approach, or gate correction that shaped the work is represented.

Correct the trail, not the story. Never remove a historical row. Add a superseding row when a claim or evidence pointer is wrong. A later run that appends to an existing export first reads the last rows and records a `start` row naming the prior range and the current run evidence.

## Independent review

Before handing back a run with a trail, launch one read-only OMP `task` with a reviewer or verifier from a different model family than the writer. Give it the audit trail and the bounded transcript path. It checks for weak or absent evidence, skipped verification, risky choices, scope creep, and gaps a casual reader would miss. It must not redo the work, edit the trail, or award the final pstack verdict.

Every response for a run that produced a trail ends with an `Attention` section. Put the reviewer role or model family on its own line, then list each flag with the relevant row or transcript moment. `No flags` is valid. A missing reviewer identity is not.

## Review the export

Read the TSV top to bottom, follow evidence pointers, and spot-check the artifact. `column -s$'\t' -t decisions.tsv` gives a terminal view. Other pstack skills route their audit trail here instead of inventing a format.

## Row guidance

Log a fork that changes the plan, a unit completed with its verification result, a pivot or revert with its trigger, a blocker, or a gate correction. Skip routine reads, repeated commands, and self-evident setup. For a loop, log one row per iteration when the iteration changes the hypothesis or result.

An OMP run is one agent conversation, including later turns and summaries. A pickup, replacement agent, or new chat starts a new run. If a later run appends to an existing TSV export, it first reads the last rows. Its first row uses phase `start`, names the range it did not write, and points to the current run evidence. Use `start` for nothing else. The pstack ledger keeps the durable decision identity while the export preserves the same row order for human review.

For example, a parent may record the following through `pstack_decision`:

```json
{
  "phase": "harness",
  "decision": "Captured the pre-change response before changing the adapter",
  "why": "The real surface must compare old behavior with new behavior",
  "evidenceRefs": ["artifact://baseline-response"],
  "result": "baseline captured"
}
```

The optional TSV export has the corresponding single-line row:

```text
2026-05-24T09:40:00Z	harness	captured the pre-change response	before and after evidence makes the adapter change reviewable	artifact://baseline-response	baseline captured
```

The evidence pointer must resolve. Do not put a narrative in the evidence cell. If a result is unknown, record `INCONCLUSIVE` or `open`; never turn missing proof into `tests green`.

When auditing, walk the rows against the active transcript's bounded session slice. Check both sides of the story: a row without a real action is false, and a material fork without a row is a gap. Add a superseding row instead of rewriting history. Cross-model review is a risk scan, not a second implementation. The reviewer flags weak evidence, skipped live verification, premature decisions, scope creep, and omissions a casual reader would miss.
