---
name: pstack-empirical-prototype
description: Resolve an observable design or behavior fork by building the smallest discriminating experiment and letting evidence choose.
---
# Empirical Prototype playbook

Resolve an observable design or behavior fork by building the smallest discriminating experiment and letting evidence choose.

**When to use:** Use for uncertain UX, API/library behavior, layout, timing, performance, compatibility, or whether an evaluation separates candidates.

## Procedure

### 1. State the fork

- Write the competing claims and the decision they affect.
- Define a discriminating observation before building anything.
- Separate preference questions from measurable facts.

### 2. Design the smallest experiment

- Use production-like inputs and the relevant surface.
- Control variables so candidates differ only in the intended factor.
- Choose thresholds and stop conditions before observing results.

### 3. Build disposable prototypes

- Create isolated variants or scripts; avoid prematurely integrating one.
- Capture environment, versions, commands, and fixtures.
- Keep the experiment cheap enough to repeat.

### 4. Observe

- Run multiple samples when noise matters.
- Store raw outputs, screenshots, traces, or benchmark data as evidence.
- Report failures and ambiguous results instead of forcing a winner.

### 5. Decide

- Map observations to the predeclared rule.
- Promote the selected design only if the experiment truly discriminated.
- Record limitations and the one condition that would reverse the decision.

### 6. Clean up or transition

- Delete disposable artifacts that do not earn a place.
- If implementation proceeds, transition to feature/refactor/performance with the evidence attached.
- Verify the promoted artifact independently.

## Agent topology

Parallel builders may create isolated candidates; a judge can compare results, but runtime evidence—not votes—settles the factual fork.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

The decision rule predates the result, raw evidence is reproducible, confounders are addressed, and inconclusive results remain inconclusive.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
