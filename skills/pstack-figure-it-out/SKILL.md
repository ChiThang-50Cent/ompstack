---
name: pstack-figure-it-out
description: Design an auditable playbook when no narrower pstack playbook fits, including large migrations, ambitious multi-part changes, or work a human reviews after stepping away.
disable-model-invocation: true
---

# Figure it out

When no existing playbook fits, design one before writing code. The first deliverable is the workflow: phases that scale rigor to the task, run a hypothesis loop, and leave a decision trail a human can audit later.

## Start

Open a `todo` list whose first item is to read the Principles section of `skill://pstack`. Add the phases below as concrete todo items. Use `skill://pstack-show-me-your-work` for the decision trail.

## Phase A: Frame

Ground first, then commit. Before the run, state:

- Definition of done as a falsifiable predicate. Use the `prove-it-works` principle in `skill://pstack`.
- Quantified scope: rough units, effort, and blockers found during grounding.
- Rigor level, biased high. One-way doors and high blast radius get more gates and artifacts. Reversible low-stakes steps get less. Rigor is evidence and gates, not “try harder”.

Present the framing and tradeoffs before committing to a long run. Reversible work proceeds without waiting for a person, but a multi-hour run earns one explicit checkpoint.

## Phase B: Design the workflow

Decompose the work into atomic, independently landable units. Sequence the riskiest unknown first. Build the verification harness and capture the pre-change baseline before features, so checks compare old behavior with new behavior.

For one-way-door design decisions, run `skill://pstack/operators/architect.md`, which may run arena. Skip it for mechanical work whose shape is already concrete. A second arena over a settled design is over-engineering. Decide what fans out. Parallelize only across real seams, give each writer disjoint output or a dedicated isolation mechanism, and do not over-fan.

Write the designed phase list down. That list is what the human reviews. Add the execution steps to the todo list after the Phase C entry and before Phase D.

## Phase C: Run the loop

Treat each unit as an experiment. State the hypothesis, make the smallest change, measure it against the predicate on the real artifact, and keep it only if it advances the predicate. Apply the `sequence-verifiable-units` principle and verify each unit before starting the next.

Inspect the artifact instead of trusting a worker summary. When something passes too easily, question the observation method. Pair delegated work with an independent judge or verifier. If a worker games a gate, reset and harden the contract. If the gate is wrong, fix the gate in its own change instead of routing around it.

A verdict is `PASS`, `FAIL`, or `INCONCLUSIVE`. Inconclusive is not a pass. Do not hide a negative result.

## Phase D: Keep the audit trail

Log the run through `skill://pstack-show-me-your-work`. Ambitious work normally commits the trail so a reviewer can read it beside the diff. The trail plus the artifact is what lets a person return later and trust the run.

## Phase E: Verify and hand back

Check the whole result against the Phase A predicate on the real product or artifact, not only the harness. Encode recurring corrections as a gate, lint rule, check, or script under the `encode-lessons-in-structure` principle.

Reply with the designed playbook, rigor level and rationale, decision-trail path, what is verified against the predicate, and what remains open. Do not claim a pass from an unobserved worker report.
