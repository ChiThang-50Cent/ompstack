---
name: pstack-bug-fix
description: Reproduce an observed defect, find the root cause, implement the smallest coherent repair, and verify the original surface.
---
# Bug Fix playbook

Reproduce an observed defect, find the root cause, implement the smallest coherent repair, and verify the original surface.

**When to use:** Use for regressions, incorrect behavior, crashes, data corruption, or a failing user-visible flow.

## Procedure

### 1. Freeze the symptom

- Capture exact inputs, environment, expected behavior, actual behavior, and frequency.
- Reproduce on the same surface used by the reporter whenever possible.
- Save the reproduction command/log/screenshot as evidence before editing.

### 2. Trace the root cause

- Run how/why scouts in parallel where useful.
- Build competing hypotheses and eliminate them with observations.
- Identify the earliest violated invariant, not merely the final thrown error.

### 3. Define the repair

- Name the affected data shape, owner, and boundary.
- Choose the smallest change that restores the invariant and avoids symptom-specific guards.
- Add or freeze a behavior-level regression check that fails for the original defect.

### 4. Implement

- Dispatch one isolated pstack-builder with a bounded artifact.
- Inspect the actual diff and reject unrelated cleanup or speculative compatibility.
- Record deviations and focused command evidence.

### 5. Adversarial review

- Use pstack-reviewer for risky or cross-boundary fixes.
- Check sibling paths, error paths, concurrency, and consuming dispatch points.
- Resolve surviving findings before final verification.

### 6. Verify the original surface

- Dispatch pstack-verifier with the original reproduction and target fingerprint.
- Run the original failure path plus relevant negative/neighbor cases.
- Record PASS only if the artifact is unchanged and required acceptance is satisfied.

## Agent topology

Typical topology: scout(s) -> architect when cross-boundary -> isolated builder -> optional reviewer -> independent verifier.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

No PASS without a preserved original reproduction, root-cause explanation, regression evidence, and verification on the same real surface.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
