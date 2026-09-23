---
name: pstack-performance
description: Improve a named performance outcome using a reproducible benchmark, profiling evidence, bounded changes, and regression-safe verification.
---
# Performance playbook

Improve a named performance outcome using a reproducible benchmark, profiling evidence, bounded changes, and regression-safe verification.

**When to use:** Use for latency, throughput, CPU, memory, allocations, I/O, startup, or scale behavior.

## Procedure

### 1. Define the metric

- Name workload, population, percentile/statistic, environment, budget, and correctness constraints.
- Create a stable baseline and preserve raw measurements.
- Reject vague goals such as make it faster.

### 2. Profile before optimizing

- Locate dominant costs with profiler/trace/query plan rather than intuition.
- Distinguish warmup, noise, network, cache, and harness overhead.
- Record bottleneck evidence and confidence.

### 3. Explore options

- Use architect/arena for materially different strategies.
- Estimate complexity, memory, correctness risk, and operational tradeoffs.
- Prefer deletion, better data shape, batching, or reduced work over micro-optimizations.

### 4. Implement one hypothesis

- Change the smallest unit that tests the bottleneck hypothesis.
- Keep correctness tests fixed.
- Avoid stacking multiple unmeasured optimizations.

### 5. Measure and decide

- Run enough samples and compare against the frozen baseline.
- Keep only improvements that exceed the predeclared threshold without correctness regressions.
- Revert/no-op unsuccessful hypotheses and record them.

### 6. Verify

- Run representative and adversarial workloads on the final fingerprint.
- Check resource ceilings, tail behavior, and semantic equivalence.
- Have an independent verifier issue the final verdict.

## Agent topology

Scout/profile tasks -> architect/arena if needed -> isolated builder -> reviewer for correctness risk -> verifier with benchmark evidence.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

A reproducible baseline and final measurement exist; improvement exceeds the decision threshold; correctness and resource constraints still pass.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
