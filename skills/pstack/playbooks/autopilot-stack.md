---
name: pstack-autopilot-stack
description: Build and independently verify a sequenced PR queue, then hand the operator one linear base-branch stack to review and land without granting merge authority.
---

# Autopilot-stack

Own the stack, never the landing. Build and verify the queue with bounded autonomy, then hand the operator one linear base-branch stack. This is the sibling of `autopilot-full`: use it when work is sequenced or coupled, review-before-landing is required, or merge authority is withheld.

## Limits in OMP

See [OMP limits](../../../docs/limitations.md#multi-day-autonomy). OMP schedules tasks and exposes job state, but it does not make a durable external queue or guarantee recovery after the host disappears. The stack remains an explicit Git/forge artifact; the operator is the final landing authority.

1. **Run one owner per PR.** Resolve the forge once. `gh` is the default; use a repository-specific forge helper only if it resolves this repository, and record the fallback. Do not require unsupported stack tooling. Dispatch a `pstack-builder` task per self-contained change. Each owner builds, pushes its first branch snapshot, opens a ready PR before self-proof, runs project gates and receipts, applies `skill://pstack-unslop` and `skill://pstack-no-comments` where relevant, follows `babysit` to green, and writes a `pstack-show-me-your-work` trail. Parallelize disjoint owners. Keep `decisions.tsv` and `children.tsv` in the durable program root and return their paths. An owner reports its branch, current base, intended parent, and exact `code-ready` SHA.
2. **Audit on a durable wake chain.** The root arms an OMP goal wake at the agreed cadence, roughly every thirty minutes for a long program. Never leave cadence to memory or lossy completion notifications. At each tick, re-read this playbook from the current base, re-read the armed objective, inspect every owner record, reconcile OMP job snapshots, and collect decision trails. Count only side effects: commits, pushes, PR/check changes, and durable reports. An owner that reaches its expected runtime without a side effect is stuck; record it, hold or replace it, and do not wait for a polite return. Follow the stuck-task rules from `autopilot-full`.
3. **Hold operator gates.** State-then-wait: stating the plan is not permission to run. On explicit go, arm the goal with the complete program objective. On operator stop, every owner takes an immediate zero-writes hold. Reconcile each job before claiming that the hold succeeded.
4. **Verify every round.** The owner reports `code-ready` after the shipped code is final and `STACK-READY` with the exact SHA after its own gates and babysitting are green. The root runs the independent multi-lane verdict described by `autopilot-full`, using `STACK-READY` in place of `merge-ready`. Nothing enters the stack without a clean verdict for its current head.
5. **Append on a clean verdict, never ship.** No owner merges, enables auto-merge, or closes a PR. The root appends a clean PR to the one linear base-branch stack in verified or operator-specified order. The operator reviews and lands the chain.
6. **Single writer on topology.** Owners push only their branches and report tip, base, and intended parent. The root is the only topology writer. To append, fetch the intended parent, rebase the child onto that exact tip, check the remote lease, push with `--force-with-lease` only on the owner's branch, and set the PR base to the parent branch. The root PR targets trunk; lower PRs target their parent. Record every rewritten SHA. Never let workers mutate shared topology.
7. **Absorb drift, then re-verify.** The root fetches current trunk and rebases the chain from bottom to top. If a conflict is in an owner's files, that owner fixes its slice and the root publishes the topology update. A rebase rewrites every SHA above it and voids old verdicts. Apply the patch-identity rule from `shipping` at each verdict SHA; anything no longer valid returns through step 4. Re-run mergeability and CI after every rewritten push. A new pin or gate value requires a fresh parent countersign; landed values absorbed from trunk are drift, not a new raise.
8. **Deliver the chain.** Return one linear chain of verified PRs, reviewable bottom-up in the resolved forge. Each link carries its verifier verdict in the PR body or a durable comment, and each link names its current head SHA. The operator lands it with their own clicks or explicit forge action.

## Choosing between autopilots

Use `autopilot-full` when PRs are independent and merge authority is granted. Use `autopilot-stack` when the operator wants review before landing, changes are sequenced or coupled, or merge authority is withheld.

## Reply

Return links to the stack root and tip, one verdict line per link, current head SHAs, and every parked or excluded item with the reason and next gate.
