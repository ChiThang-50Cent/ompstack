---
name: pstack-test-repair
description: Repair broken, flaky, misleading, or insufficient tests while preserving behavior-level signal and proving the test can detect the target regression.
---
# Test Repair playbook

Repair broken, flaky, misleading, or insufficient tests while preserving behavior-level signal and proving the test can detect the target regression.

**When to use:** Use when tests fail unexpectedly, are flaky, overfit implementation, or do not guard the intended behavior.

## Procedure

### 1. Classify failure

- Reproduce and determine product bug, test bug, environment issue, nondeterminism, or obsolete expectation.
- Capture seed, timing, platform, versions, and raw output.
- Do not weaken assertions before understanding the failure.

### 2. Trace the contract

- Identify the user/caller behavior the test intends to protect.
- Read production path and nearby tests.
- Check whether the test still passes when dependencies return empty/default values.

### 3. Design signal

- Prefer public behavior and literal expected outcomes over internal call counts or snapshots without semantic assertions.
- Control time/randomness/concurrency at boundaries.
- Define a mutation or known-bad fixture the repaired test must reject.

### 4. Repair

- Use bounded builder to fix harness, fixture, expectation, or product as evidence dictates.
- Avoid sleeps, retries, broad exception swallowing, and assertion deletion as default fixes.
- Record why the old test failed.

### 5. Stress and negative proof

- Repeat flaky paths, vary seed/order where relevant, and run the known-bad mutation/fixture.
- Confirm the test fails for the defect and passes for the repair.
- Check suite isolation and cleanup.

### 6. Verify

- Run focused and broader affected suites on final fingerprint.
- Independent verifier evaluates behavior-level coverage and absence of masking.
- Record environmental limitations as INCONCLUSIVE.

## Agent topology

Scout -> builder -> reviewer for assertion quality -> verifier. Performance/concurrency flake work may add empirical-prototype.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Root classification is evidence-backed, the test detects a known-bad case, no behavior is silently waived, and repeated runs demonstrate stable signal.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
