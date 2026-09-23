---
name: pstack-feature
description: Add a capability from frozen outcomes through data-shape design, bounded implementation, integration review, and real-surface verification.
---
# Feature playbook

Add a capability from frozen outcomes through data-shape design, bounded implementation, integration review, and real-surface verification.

**When to use:** Use when behavior, API, UI, workflow, or product capability is intentionally expanded.

## Procedure

### 1. Frame outcomes

- Translate the request into observable acceptance criteria and non-goals.
- Identify genuine product choices versus facts that can be tested.
- Record reversible defaults instead of blocking on the user.

### 2. Ground the system

- Trace existing entry points, owners, data paths, conventions, and tests.
- Find the narrowest extension point and all downstream consumers.
- Measure current behavior when the change depends on timing, layout, or output.

### 3. Design the data shape

- Use pstack-architect for any function/module boundary crossing.
- Specify states, types, ownership, invariants, errors, migration, and compatibility policy.
- Explore alternatives or prototypes when the design is contested.

### 4. Throughput checkpoint

- List independent artifacts, dependencies, and ownership.
- Choose what can run in parallel without shared mutable state.
- Define a done predicate and evidence contract for every delegated slice.

### 5. Implement and integrate

- Run isolated builders for disjoint slices.
- The coordinator reviews every diff and performs one coherent integration/synthesis.
- Migrate callers and delete obsolete internal paths rather than preserving indefinite dual systems.

### 6. Review and verify

- Interrogate contested/high-risk changes with same-rubric reviewers.
- Run the project verification skill on the user/caller surface.
- Bind final PASS to the integrated artifact, not to individual candidate branches.

## Agent topology

Scout -> architect -> bounded isolated builders -> reviewer/interrogate where warranted -> independent verifier.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

All required outcomes are observable on the integrated artifact; data ownership and failure behavior are explicit; no stale verdict.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
