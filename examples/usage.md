# Usage examples

These examples illustrate the task shapes the skill should prefer. They are not shell commands.

## Small bug

```text
/ompstack Fix the cache invalidation bug when an existing user changes organizations. Reproduce the failing lookup first.
```

Expected routing: Medium unless evidence shows a shared/core blast radius. Parent or one default `task` worker implements, then deterministic reproduction + one independent verifier/reviewer.

## High-risk feature

```text
/ompstack Add idempotency for webhook delivery. Persistence and concurrency semantics are high risk. Compare viable designs only if the current architecture leaves a real choice, then implement and independently verify duplicate delivery.
```

Expected routing: High. `ompstack-architect` if needed, default `task` owner, parent gates, `reviewer` + `ompstack-verifier`.

## OMP-native implementation batches

The idempotency repository contract is a prerequisite for the handler. Keep them in separate batches.

### 1. Establish the repository contract

```json
{
  "context": "# Goal\nImplement the agreed webhook idempotency repository. Proof surface: duplicate delivery cannot create a second persistence effect.\n\n# Constraints\nPrimary route: feature\nExecution overlays/phases: none\nRisk: high\nProgress tracking: native todo\nPreserve the public handler API and use the existing event key as the idempotency key.\n\n# Contract\nWrite owner: PersistenceLane.\nPersistenceLane writable: persistence/repository layer.\nHandlerLane is not started in this batch.\nShared idempotency repository contract owner: PersistenceLane.\nIntegration owner: parent.\nFan-in order: persistence contract, then HandlerLane in a separate batch.\nShared gate: parent reruns duplicate-delivery reproduction and the narrow regression suite once after handler fan-in.\nIndependent evidence: reviewer + verifier.",
  "tasks": [
    {
      "name": "PersistenceLane",
      "task": "# Target\nPersistence/repository layer for webhook events.\n\n# Change\nImplement atomic idempotency storage and report the concrete repository contract for the later handler batch. Do not change the public handler API.\n\n# Acceptance\nReport the repository contract, changed files, and any narrow behavior exercised. Skip project-wide lint/build/test; parent will run shared gates."
    }
  ]
}
```

### 2. Consume the established contract

After `PersistenceLane` returns its concrete contract, the parent inserts that exact result into both the next batch context and task. The example below uses a fully concrete illustrative contract:

```json
{
  "context": "# Goal\nConsume the established webhook idempotency repository contract. Proof surface: duplicate delivery returns the original behavior without a second persistence effect.\n\n# Constraints\nPrimary route: feature\nExecution overlays/phases: none\nRisk: high\nProgress tracking: native todo\nPreserve the public handler API.\n\n# Contract\nWrite owner: HandlerLane.\nHandlerLane writable: webhook handler/service path.\nShared idempotency repository contract owner: PersistenceLane.\nEstablished repository contract: reserveDelivery(eventKey) atomically returns { status: \"reserved\" | \"duplicate\", deliveryId: string }; HandlerLane consumes but does not change this shape.\nIntegration owner: parent.\nFan-in order: handler implementation, then parent integration.\nShared gate: parent reruns duplicate-delivery reproduction and the narrow regression suite once after fan-in.\nIndependent evidence: reviewer + verifier.",
  "tasks": [
    {
      "name": "HandlerLane",
      "task": "# Target\nWebhook handler/service path.\n\n# Change\nConsume this established contract without changing it: reserveDelivery(eventKey) atomically returns { status: \"reserved\" | \"duplicate\", deliveryId: string }. Preserve the public handler API and return existing behavior for duplicate deliveries.\n\n# Acceptance\nReport changed files and the narrow behavior exercised. Skip project-wide lint/build/test; parent will run shared gates."
    }
  ]
}
```

## Independent evidence batch

After deterministic gates pass, a high-risk change may use specialized agents:

```json
{
  "context": "# Goal\nVerify webhook idempotency against the combined change. Proof surface: the duplicate-delivery reproduction.\n\n# Constraints\nPrimary route: feature\nExecution overlays/phases: verification\nRisk: high\nProgress tracking: native todo\nDeterministic targeted tests are already green. Verifiers are trusted roles instructed not to edit; their tools are not a write sandbox.\n\n# Contract\nWrite owner: parent. Writable files: none. Review scope: combined persistence and handler diff.\nReview lanes: PatchReview static review; BehaviorVerification duplicate-delivery execution.\nIntegration owner: parent.\nFan-in order: collect both verdicts, inspect unexpected worktree mutations, then parent synthesis.\nShared gate: duplicate-delivery reproduction and targeted tests already passed before this evidence batch.\nIndependent evidence: reviewer + verifier.",
  "tasks": [
    {
      "name": "PatchReview",
      "agent": "reviewer",
      "task": "# Target\nCombined persistence and webhook-handler diff; read-only review surface.\n\n# Change\nReview patch-introduced correctness issues, regressions, and edge cases. Focus on persistence and duplicate-delivery semantics. Do not edit.\n\n# Acceptance\nReturn a concise verdict with evidence-backed findings or state that no finding survived review. Skip project-wide validation; parent already ran shared gates."
    },
    {
      "name": "BehaviorVerification",
      "agent": "ompstack-verifier",
      "task": "# Target\nDuplicate-delivery behavior in the current combined worktree; no writable files.\n\n# Change\nIndependently exercise duplicate delivery using the narrowest existing reproduction. Do not edit. Return BLOCKED if the required runtime surface is unavailable.\n\n# Acceptance\nReturn PASS, FAIL, or BLOCKED with exact commands or flows, observed behavior, remaining gaps, and any unexpected worktree mutations. Skip project-wide validation."
    }
  ]
}

```

The `task` call starts asynchronous jobs. The parent waits for both auto-delivered results or uses `hub wait`, reads any referenced `agent://`, `history://`, or artifact payloads, and only then performs the fan-in synthesis described above.

Add `security-reviewer` only when the actual change crosses a security boundary.

## Conditional native Todo progress

For a genuinely multi-phase parent workflow, record progress separately from queue topology and child-task status:

```text
# Constraints
Primary route: feature
Execution overlays/phases: queue + verification
Risk: high
Progress tracking: native todo

Parent:
1. todo.view
2. todo.init only when the list is empty
3. Keep “Fan in idempotency lanes” pending until every task artifact is inspected
4. todo.block “Drive duplicate-delivery proof” with the exact unavailable Doctor prerequisite
5. todo.unblock, rerun Doctor, then append a distinct rerun item after a behavior-changing repair
```

Only the parent mutates Todo. A task worker reports its output and evidence; it does not own the parent progress list.

## Project-local verification capability

Create verification infrastructure only when the project lacks a reliable real-surface proof and the user asks for that investment:

```text
/skill:ompstack-create-verification Create a verification skill for this service's public HTTP API. Reuse its existing integration harness and prove one mapped endpoint.
```

The generated project artifact is native OMP configuration:

```text
.omp/skills/verify-api/SKILL.md
.omp/skills/verify-api/features/README.md
.omp/skills/verify-api/features/create-order.md
```

For a long-running task, keep the material route, design, and verification checkpoints in a decision trail. The trail points to the actual OMP artifacts rather than copying their contents:

```text
bun <ompstack-plugin-root>/scripts/append-decision-trail.mjs \
  .omp/audit/order-idempotency.tsv implementation \
  "reserved duplicate-delivery key" \
  "atomic repository contract prevents a second persistence effect" \
  "agent://PersistenceLane" \
  "contract established"
```

Audit a stale verification skill without modifying product code:

```text
/ompstack-maintain-verification Audit verify-api after the order endpoint rewrite. Drive each mapped endpoint and report CLEAN, CHANGED, or BLOCKED.
```
