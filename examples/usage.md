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
  "context": "# Goal\nImplement the agreed webhook idempotency repository. Proof surface: duplicate delivery cannot create a second persistence effect.\n\n# Constraints\nRoute: feature\nRisk: high\nPreserve the public handler API and use the existing event key as the idempotency key.\n\n# Contract\nWrite owner: PersistenceLane.\nPersistenceLane writable: persistence/repository layer.\nHandlerLane is not started in this batch.\nShared idempotency repository contract owner: PersistenceLane.\nIntegration owner: parent.\nFan-in order: persistence contract, then HandlerLane in a separate batch.\nShared gate: parent reruns duplicate-delivery reproduction and the narrow regression suite once after handler fan-in.\nIndependent evidence: reviewer + verifier.",
  "tasks": [
    {
      "name": "PersistenceLane",
      "task": "# Target\nPersistence/repository layer for webhook events.\n\n# Change\nImplement atomic idempotency storage and report the concrete repository contract for the later handler batch. Do not change the public handler API.\n\n# Acceptance\nReport the repository contract, changed files, and any narrow behavior exercised. Skip project-wide lint/build/test; parent will run shared gates."
    }
  ]
}
```

### 2. Consume the established contract

After `PersistenceLane` returns its concrete contract, the parent starts `HandlerLane` in a separate batch:

```json
{
  "context": "# Goal\nConsume the established webhook idempotency repository contract. Proof surface: duplicate delivery returns the original behavior without a second persistence effect.\n\n# Constraints\nRoute: feature\nRisk: high\nPreserve the public handler API.\n\n# Contract\nWrite owner: HandlerLane.\nHandlerLane writable: webhook handler/service path.\nShared idempotency repository contract owner: PersistenceLane.\nHandlerLane reads the established repository contract and does not change it.\nIntegration owner: parent.\nFan-in order: handler implementation, then parent integration.\nShared gate: parent reruns duplicate-delivery reproduction and the narrow regression suite once after fan-in.\nIndependent evidence: reviewer + verifier.",
  "tasks": [
    {
      "name": "HandlerLane",
      "task": "# Target\nWebhook handler/service path.\n\n# Change\nConsume the established repository idempotency contract and return existing behavior for duplicate deliveries.\n\n# Acceptance\nReport changed files and the narrow behavior exercised. Skip project-wide lint/build/test; parent will run shared gates."
    }
  ]
}
```
## Independent evidence batch

After deterministic gates pass, a high-risk change may use specialized agents:

```json
{
  "context": "# Goal\nVerify webhook idempotency against the combined change. Proof surface: the duplicate-delivery reproduction.\n\n# Constraints\nRoute: verification\nRisk: high\nDeterministic targeted tests are already green. Do not edit.\n\n# Contract\nWrite owner: parent. Writable files: none. Review scope: combined persistence and handler diff.\nReview lanes: PatchReview static review; BehaviorVerification duplicate-delivery execution.\nIntegration owner: parent.\nFan-in order: collect both verdicts, then parent synthesis.\nShared gate: duplicate-delivery reproduction and targeted tests already passed before this evidence batch.\nIndependent evidence: reviewer + verifier.",
  "tasks": [
    {
      "name": "PatchReview",
      "agent": "reviewer",
      "task": "Review the current diff for patch-introduced correctness issues, regressions, and edge cases. Focus on persistence and duplicate-delivery semantics."
    },
    {
      "name": "BehaviorVerification",
      "agent": "ompstack-verifier",
      "task": "Independently exercise duplicate delivery against the current worktree using the narrowest existing test/reproduction surface. Return PASS, FAIL, or BLOCKED with exact evidence."
    }
  ]
}
```

Add `security-reviewer` only when the actual change crosses a security boundary.
