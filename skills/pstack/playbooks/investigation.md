---
name: pstack-investigation
description: Answer a read-only engineering question from cited repository/runtime/history evidence without drifting into implementation.
---
# Investigation playbook

Answer a read-only engineering question from cited repository/runtime/history evidence without drifting into implementation.

**When to use:** Use when the deliverable is understanding: behavior, ownership, architecture, rationale, compatibility, or blast radius.

## Procedure

### 1. Frame the question

- Restate the exact question, time/version boundary, and required depth.
- Define what evidence would settle it and what remains outside scope.
- Start a run only when the investigation is nontrivial or must be auditable.

### 2. Map how it works

- Dispatch bounded pstack-scout tasks by subsystem or evidence source.
- Trace data from entry point through boundaries to consumers and side effects.
- Read tests and runtime configuration as evidence, not as proof that production behavior matches.

### 3. Recover why

- Inspect history, issues, docs, and nearby decisions when rationale matters.
- Separate documented intent from inference and state confidence.
- Record searches that produced no result; absence is not proof.

### 4. Reconcile

- Compare scout outputs against the same question.
- Resolve contradictions by opening the primary evidence, not by majority vote.
- List known facts, supported inferences, unknowns, and blast radius.

### 5. Answer

- Produce the requested answer with path/line, command, commit, or authoritative-source anchors.
- Do not propose code unless the user requested recommendations.
- If implementation is now requested, close or transition explicitly to the matching playbook.

## Agent topology

Use one or more `pstack-scout` agents. Add `pstack-architect` only if the deliverable includes a design recommendation.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

The answer must be traceable to primary evidence and must distinguish facts, inferences, and unresolved unknowns.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
