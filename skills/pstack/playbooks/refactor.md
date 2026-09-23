---
name: pstack-refactor
description: Change structure while preserving externally observable behavior, using characterization, small verifiable units, and deletion of obsolete structure.
---
# Refactor playbook

Change structure while preserving externally observable behavior, using characterization, small verifiable units, and deletion of obsolete structure.

**When to use:** Use when the primary goal is maintainability, ownership, boundaries, or simplification rather than new behavior.

## Procedure

### 1. Freeze behavior

- Identify the public/caller surfaces that must remain stable.
- Add characterization only where current behavior is not already observable.
- Record allowed intentional differences as explicit acceptance criteria.

### 2. Map structure and load

- Trace ownership, hidden state, wrappers, dependency direction, and duplicated assumptions.
- Count layers and identify the smallest simplification that removes reader load.
- Challenge whether the refactor is necessary at all.

### 3. Design target shape

- Model the domain and boundaries as if the target structure had existed from the start.
- Plan caller migration and legacy deletion in the same wave.
- Sequence units so each leaves the repository coherent and testable.

### 4. Execute in units

- Use isolated builders only for disjoint ownership.
- After each unit, run focused characterization and inspect the diff.
- Do not preserve transitional abstractions beyond their phase.

### 5. Delete and normalize

- Remove legacy APIs, dead wrappers, stale tests, and compatibility scaffolding once callers migrate.
- Run static checks for old names/paths.
- Record intentional retained debt with a reason.

### 6. Verify equivalence

- Exercise public/caller behavior on the final artifact.
- Use reviewer to detect semantic drift across boundaries.
- Independent verifier grants PASS only for allowed behavior.

## Agent topology

Scout -> architect -> one or more sequential/isolated builders -> reviewer -> verifier.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

External behavior is characterized and preserved, target ownership is simpler, migrated callers no longer depend on legacy paths, and obsolete structure is removed.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
