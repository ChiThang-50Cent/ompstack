---
name: pstack-shipping
description: Assess and land a PR or dependency stack only through independent per-unit verdicts and a contiguous verified prefix.
---
# Shipping playbook

Assess and land a PR or dependency stack only through independent per-unit verdicts and a contiguous verified prefix.

**When to use:** Use when asked to ship, land, merge, or declare a stack release-ready.

## Procedure

### 1. Map the stack

- Enumerate units in dependency order with base/head SHAs, patch identity, CI state, and ownership.
- Freeze the intended landing order and release constraints.
- Do not equate green CI or bot approval with a verdict.

### 2. Verify each unit

- Assign a verifier who did not write that unit.
- Review the actual patch and exercise its relevant behavior on the exact head.
- Store evidence and PASS/FAIL/INCONCLUSIVE per unit.

### 3. Compute the safe prefix

- Starting at the root, include consecutive PASS units only.
- Stop at the first missing, stale, FAIL, or INCONCLUSIVE verdict.
- A later PASS cannot leapfrog a broken dependency.

### 4. Refresh stale units

- Rebase/conflict resolution/new commits invalidate affected verdicts.
- Recompute patch/head identity and reverify.
- Ensure CI and required checks correspond to the same artifact.

### 5. Arm landing

- Present the contiguous verified prefix, excluded units, risks, and exact irreversible action.
- Pause for merge/deploy/force-push authorization when required.
- Use repository protections; do not bypass gates.

### 6. Post-land check

- Observe resulting integration/release behavior.
- Record landed SHAs and any follow-up.
- If behavior regresses, transition to incident/bug-fix rather than retroactively preserving PASS.

## Agent topology

Per-unit reviewer/verifier contexts independent from writers; coordinator computes the prefix and performs no irreversible action without authority.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Only a contiguous root-to-tip prefix with fresh artifact-bound PASS verdicts is landable; actual merge/deploy remains operator-gated.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
