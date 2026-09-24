---
name: pstack-hillclimb
description: Improve one measurable metric through a supervised loop of baseline, one hypothesis, one change, one measurement, and keep-or-revert decisions.
---

# Hillclimb playbook

Own the metric and the experiment's integrity. Delegate bounded attempts, supervise the artifact, and review every result. Use this for sustained iterative improvement of one measurable outcome against a target. A one-off repair belongs in `bug-fix` or `performance`.

## Procedure

### 1. Ground the workload and metric

Run `skill://pstack/operators/how.md` over the target. Name the realistic workload dimensions that can move the result, such as data size, history, state, or concurrency. Choose a case that reproduces the user's complaint. If no case reproduces it, repair the reproduction before optimizing.

Choose exactly one primary metric, its direction, a target, and a checkable stop predicate. The predicate pairs the target with a minimum attempt floor so a lucky early win cannot end the run. Use the user's numbers when provided. Otherwise record the chosen threshold and why it is appropriate. Record the metric and predicate with `pstack_decision`.

### 2. Build and freeze the harness

Use the `build-the-lever` principle in `skill://pstack`. Build a repeatable measurement harness with production-like inputs. Prove sensitivity with contrasting realistic workloads. Confirm the target case reproduces the symptom while easier cases separate as expected. If the harness cannot distinguish them, revise the workload or metric.

Once frozen, use one repeatable command that emits the metric with enough samples to clear noise, such as a median of N rather than one run. Capture the baseline metric and a green regression gate before editing. Store raw outputs and the baseline as evidence with `pstack_evidence`.

### 3. Open the decision trail

Use `skill://pstack-show-me-your-work`. The pstack decision ledger is canonical. An optional `decision.tsv` export can record one row per attempt with the hypothesis, change, before value, after value, delta, regression checks, verdict, and note. Read the previous row before each attempt.

### 4. Run one hypothesis per iteration

Ground each hypothesis in the architecture model. Name a concrete mechanism, not “try memoization”. For each iteration:

1. State the hypothesis and expected metric movement.
2. Dispatch one bounded `pstack-builder` through OMP `task` with one writer, a disjoint artifact or isolated worktree, and an exact done predicate.
3. Inspect the actual diff. Do not accept the worker's summary as proof.
4. Measure before and after with the frozen harness.
5. Run the regression gate and the original reproduction.
6. Keep the change only when the metric clears noise and correctness remains green. Otherwise revert the full change.
7. Record a decision row and `pstack_evidence` for both kept and reverted attempts.
8. Commit each accepted fix with only the changed files. Verify the committed artifact before the next iteration.

If several independent hypotheses are live, fan them out only into separate worktrees or artifacts. Do not serialize shared mutable state behind parallel writers. The coordinator owns supervision and review.

### 5. Push past the plateau

Do not stop at the first win or relax the predicate to meet it. On a stall or several rejects, pivot category, revisit the architecture, combine only evidence-compatible near-misses, or try a more radical hypothesis. Re-read the relevant source. Correctness and simplicity outrank the number. Revert a metric win that breaks behavior. Keep a simplification that holds the metric.

### 6. Stop and hand back

Stop when the predicate is met and the remaining cheap hypotheses are not worth their risk, or when the evidence establishes a genuine dead end. A plateau alone is not a dead end. Do not spin indefinitely. Surface a blocked environment or inaccessible measurement as `INCONCLUSIVE`, not as a failed optimization.

Run the normal PR or shipping workflow only when the user asks for it or the selected delivery playbook requires it. The metric loop itself does not authorize publication, deployment, or a destructive rollback.

## Reply

Return the metric and target, baseline to final with percent delta and units, iterations kept versus reverted, each accepted fix on one line, the decision-trail path, evidence references, remaining limitations, and the best next hypothesis if the run continued. State whether the final predicate is met. Never claim a win from code inspection alone.
