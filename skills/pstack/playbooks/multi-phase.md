---
name: pstack-multi-phase
description: Run a long, staged engineering task within one live OMP session using durable phase state, bounded iterations, and checkpoints.
---
# Multi Phase playbook

Run a long, staged engineering task within one live OMP session using durable phase state, bounded iterations, and checkpoints.

**When to use:** Use when work spans several dependent phases or the user will review later, but no external always-on worker daemon is available.

## Procedure

### 1. Write the run brief

- State objective, non-goals, acceptance, constraints, authority, irreversible gates, and stop conditions.
- Break work into phases that each produce a durable artifact and check.
- Persist the brief and TODO before large fan-out.

### 2. Establish the frontier

- Identify completed/verified prerequisites and the next unblocked units.
- Do not start downstream work on an unverified foundation.
- Assign owners and isolate mutable artifacts.

### 3. Execute one bounded unit

- Dispatch only work with clear inputs, outputs, schema, and done predicate.
- Drain and inspect results before expanding the frontier.
- Record decisions and evidence outside the conversation context.

### 4. Checkpoint

- Update run phase, acceptance, fingerprint, TODO, decisions, and unresolved risks.
- Commit or save coherent artifacts as appropriate.
- Summarize enough for session pickup without copying raw transcripts.

### 5. Repeat or pause

- Continue while an unblocked reversible unit exists.
- Pause with explicit next action and reason when credentials, authority, or an irreversible gate is required.
- Do not promise execution after the OMP process stops.

### 6. Close

- Run integrated review and independent verification.
- Confirm all required phases and acceptance are closed.
- Export final state/evidence and complete through the gate tool.

## Agent topology

Coordinator owns the program. Use subagents as bounded workers; nested coordinators only when workstreams are truly independent and provenance remains clear.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Each phase has a durable artifact/checkpoint, no downstream unit bypasses the verified frontier, and the final integrated fingerprint is independently verified.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
