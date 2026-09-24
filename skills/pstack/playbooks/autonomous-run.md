---
name: pstack-autonomous-run
description: Drive a bounded long-running OMP goal to a declared exit predicate, checkpoint every iteration, and stop only when the predicate is met or evidence proves a dead end.
---

# Autonomous run

Own the exit condition. Define done before the first iteration, then drive toward it without treating idle time or a plateau as success.

1. State a checkable predicate before changing anything: tests green, the original reproduction fixed, all requested PRs ready, or image diff zero. If the predicate cannot be observed, narrow it first.
2. Arm an OMP goal for the full objective. Use the platform's goal wake or scheduled status mechanism for a watched event. A time-based heartbeat may be a fallback, but every wake must run a real status check. Do not rely on completion notifications as durable state.
3. Each iteration makes the smallest change supported by evidence, verifies against the predicate on the real artifact, and commits if it advanced. Revert changes that did not help. Sequence units so each one is verified before the next.
4. Mid-run discoveries that block the predicate are in scope. Repair broken skills, flaky checks, orphaned follow-ups, and tooling drift through bounded tasks. Do not ask the operator about reversible choices covered by the autonomy grant. Pause only for irreversible actions, genuine product or preference calls no experiment can settle, inaccessible prerequisites, or a real dead end.
5. Checkpoint every iteration with `skill://pstack-show-me-your-work`. Record the changed artifact, evidence, predicate result, and next hypothesis through `pstack_decision`.
6. Stop when the predicate is met. A plateau is not a stop. Pivot the method, re-read the relevant skill, or surface a genuine dead end with the evidence that rules out cheap next moves. Never relax the predicate to declare victory.

If a child task becomes silent, reconcile its artifact and OMP job state before deciding whether to replace it. A worker report is not completion. If the environment cannot provide the required surface, return `INCONCLUSIVE` with the exact limitation and leave the goal open or explicitly abandoned.

## Reply

Return the exit predicate, iterations run, artifacts and commits that landed, changes discarded and why, final predicate state, open gates, and the next action. Record any operator authorization boundary instead of silently crossing it.
