---
name: pstack-review
description: Evaluate an existing change against frozen intent with same-rubric independent reviewers and evidence-backed triage.
---
# Review playbook

Evaluate an existing change against frozen intent with same-rubric independent reviewers and evidence-backed triage.

**When to use:** Use for code review, design review, audit, or are-we-sure requests where the artifact already exists.

## Procedure

### 1. Freeze scope

- Capture the exact artifact fingerprint, diff/base, objective, constraints, and acceptance.
- Exclude unrelated pre-existing debt unless it blocks the stated change.
- Ensure reviewers can access the actual artifact, not only a summary.

### 2. Define rubric

- Use 3-6 criteria appropriate to the artifact: correctness, boundary integration, safety, simplicity, compatibility, evidence.
- Give every reviewer the same rubric and frozen context.
- Do not manufacture diversity through vague personas.

### 3. Independent passes

- Dispatch pstack-reviewer contexts, preferably across model families.
- Require concrete trigger, impact, location, and evidence for every finding.
- Review consuming paths outside the diff where new values cross boundaries.

### 4. Triage

- Deduplicate root causes and classify fix, consider, note, or reject.
- Validate high-impact findings against primary evidence.
- Reject speculative, stylistic, or premise-incorrect findings with a concrete reason.

### 5. Repair loop

- If fixes are required, use a bounded builder and inspect the new diff.
- Invalidate prior artifact-bound conclusions after edits.
- Repeat focused review only where the artifact changed.

### 6. Verify

- Review correctness is not the same as runtime verification.
- Run pstack-verifier on acceptance criteria when the change is to ship.
- Record final PASS/FAIL/INCONCLUSIVE separately.

## Agent topology

One or more pstack-reviewer agents; coordinator triages; builder repairs; pstack-verifier validates runtime behavior.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Every surviving finding is evidence-backed and artifact-anchored; rejected findings have reasons; runtime claims receive a separate verdict.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
