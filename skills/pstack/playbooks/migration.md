---
name: pstack-migration
description: Move data, schemas, protocols, APIs, or callers to a target state with explicit invariants, idempotency, rollback, and completion proof.
---
# Migration playbook

Move data, schemas, protocols, APIs, or callers to a target state with explicit invariants, idempotency, rollback, and completion proof.

**When to use:** Use for database/schema changes, file formats, protocol versions, API transitions, or broad caller migrations.

## Procedure

### 1. Inventory

- Enumerate producers, consumers, stored data, versions, environments, and hidden/manual callers.
- Quantify the population and identify irreversible operations.
- Freeze source and target schemas plus invariants.

### 2. Choose migration topology

- Decide stop-the-world, expand/migrate/contract, replay, dual-read/write, or compatibility window based on evidence.
- Define idempotency, retries, checkpoints, observability, rollback, and ownership.
- Avoid indefinite dual systems; set an exit condition.

### 3. Prototype and dry-run

- Run on representative copies/fixtures.
- Measure duration, failure modes, data loss/duplication, and restart behavior.
- Validate that rollback or forward-fix procedures actually execute.

### 4. Execute verifiable units

- Sequence schema, writers, readers, backfill, validation, and cleanup in dependency order.
- Every phase ends with an invariant check and durable checkpoint.
- Pause before production/destructive actions unless explicitly authorized.

### 5. Contract

- Migrate all callers, disable old writers/readers, and delete legacy APIs/columns/flags when safe.
- Search for residual use and stale operational instructions.
- Do not call the migration complete while compatibility paths still carry traffic without an explicit accepted reason.

### 6. Verify

- Compare counts, checksums, semantic samples, and end-to-end behavior.
- Test restart/idempotency and failure recovery.
- Bind the final verdict to the exact code/config/migration artifact.

## Agent topology

Scouts for inventory -> architect -> dry-run builder(s) -> reviewers by boundary -> verifier. Production execution remains operator-gated.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

All populations and callers are accounted for, invariants hold, restart/rollback behavior is demonstrated, and legacy paths are removed or explicitly time-bounded.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
